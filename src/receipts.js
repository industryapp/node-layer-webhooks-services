/**
 * Create listener for Messages that have been unread or undelivered for a specified period.
 *
 *     var kue = require('kue'),
 *         queue = kue.createQueue();
 *
 *     layerWebhooks.receipts({
 *        expressApp: app,
 *        secret: 'Frodo is a Dodo',
 *        hooks: [{
 *          name: 'Message Read Monitor',
 *          path: '/message-read-monitor',
 *          receipts: {
 *            delay: '10 minutes', // Only handle Messages that remain unread/undelivered for 10 minutes
 *            reportForStatus: ['sent'] // values are 'sent', 'delivered', 'read'; any values you include will cause the message to be flagged if after delay a user is still in that state
 *          }
 *        }]
 *     });
 *
 *     queue.process('Message Read Monitor', 50, function(job, done) {
 *       // Get the Message that some recipients failed to read or have delivered
 *       var message = job.data.message;
 *
 *       // Get an array of recipients who didn't read or have delivered the `job.data.message`
 *       var recipientsToProcess = job.data.recipients;
 *
 *       recipients.toProcess.forEach(function(userId) {
 *           sendAnSMS(userId, message);
 *       });
 *     });
 *
 * NOTE: This service ignores Messages sent by the Platform API where `sender.name` is used rather
 * than `sender.user_id`.
 *
 * @param {Redis} redis - This is passed in via bind and does not need to be passed into calls to this module
 * @param {Express App} options.expressApp - An instance of an express app; needed to create .get() and .post() listeners for the webhook requests
 * @param {String} options.secret - String known only to your company for use validating
 *                          that requests to your webhook endpoints come from authorized sources.
 * @param {Object} options.hooks - Array of webhooks to setup; typically only one for this service.
 * @param {String} options.hooks.name - A unique name or ID for your webhook; used for the Kue job name and for logging
 * @param {String} options.hooks.path - Path extension to your url for listening to these webhooks;
 *                        this is where the express app will be listening for this hook.
 * @param {Object} options.hooks.receipts - Receipts specific configuration
 * @param {Number} options.hooks.receipts.delay - Time to wait before processing this Message.  Want to notify someone
 *                         after an hour of failing to have a Message delivered? Use `10 minutes` to wait 10 minutes.
 * @param {String[]} options.hooks.receipts.reportForStatus - Report on all recipients whose state matches any of the states you list.
 *                             Possible values are 'sent', 'delivered', 'read'.  ['sent'] will report on all recipients who are still in
 *                            'sent' state for triggering "undelivered" processing.  ['sent', 'delivered'] will report on all users who are either
 *                            'sent' OR 'delivered' meaning anyone who hasn't read the Message.
 * @param {Boolean|Function} [options.hooks.receipts.identities=false] - If false, do nothing.
 *                                                                    If true, include Identity data from the Layer Identity Server for the sender and each Recipient.
 *                                                                    If a function, use the Function to get Identity data.
 * @param {string} options.hooks.recipients.identities.userId - String representing the userId
 * @param {string} options.hooks.recipients.identities.callback - Callback for providing the user data: `callback(null, {name: 'frodo'})`
 *
 * Your jobs.data will contain:
 * @param {String[]} recipients - Array of recipients who match the `states` you passed in
 * @param {Object} message - A full REST Message object for the Message that has at least one recipient matching the `states`.
 */

var ms = require('ms');
var listen = require('./listen');
var queue = require('kue').createQueue();
var Debug = require('debug');
var REDIS_PREFIX = 'layer-webhooks-';

module.exports = function(layerClient, redis, options) {

  var originalHooks = options.hooks;
  options.hooks = options.hooks.map(function(hook) {
    return {
      name: hook.name + ':receipts',
      originalName: hook.name,
      path: hook.path,
      events: hook.events,
      receipts: {
        delay: ms(hook.delay),
        reportForStatus: hook.receipts.reportForStatus,
	      identities: hook.receipts.identities
      }
    };
  });

  listen(options);

  options.hooks.forEach(function(hook) {
    var logger = Debug('layer-webhooks-services:' + hook.name.replace(/\s/g,'-'));

    /**
     * Process each webhook event
     */
    queue.process(hook.name, 50, function(job, done) {
      try {
        var event = job.data;
        var message = event.message;
        if (message.sender.name) return done();
        switch (event.type) {
          // Store the new message data and schedule a job to check the delivery status in 15 minutes
          case 'message.sent':
              redis.set(REDIS_PREFIX + hook.name + '-' +  message.id, JSON.stringify(message));
              queue.createJob(hook.name + ' delayed-job', {
                title: 'Process undelivered message',
                messageId: message.id
              }).delay(hook.receipts.delay).attempts(10).backoff( {type:'exponential', delay: 1000} )
              .save(function(err) {
                if (err) console.error(new Date().toLocaleString() + ': ' + hook.name + ': Unable to create Kue process: ', err );
              });
              break;

          // Update the message data
          case 'message.delivered':
          case 'message.read':
            redis.set(REDIS_PREFIX + hook.name + '-' + message.id, JSON.stringify(message));
            break;

          // Delete the Message data; redis.get will fail for this item.
          case 'message.deleted':
            redis.del(REDIS_PREFIX + hook.name + '-' + message.id);
            break;
        }
      } finally {
        done();
      }
    });

    /**
     * For each undelivered message retrieve the message from redis, and if not yet deleted,
     * process the message.
     */
    queue.process(hook.name + ' delayed-job', function(job, done) {
      var messageId = job.data.messageId;
      logger('Processing ' + messageId);
      redis.get(REDIS_PREFIX + hook.name + '-' +  messageId, function (err, reply) {
        try {
          if (reply) {
            processMessage(JSON.parse(reply));
            redis.del(REDIS_PREFIX + hook.name + '-' + messageId);
          }
        } finally {
          done();
        }
      });
    });

    function getUserFromIdentities(userId, callback) {
      layerClient.identities.get(userId, function(err, response) {
      	var identity = err ? null : response.body;
      	callback(err, identity);
      });
    }

    /**
     * Process an individual Message and create a job if there
     * are matching recipients.
     */
    function processMessage(message) {
      var recipients = Object.keys(message.recipient_status).filter(function(userId) {
        return hook.receipts.reportForStatus.indexOf(message.recipient_status[userId]) !== -1;
      });

      if (recipients.length) {
      	var identities = [message.sender.user_id].concat(recipients);
      	var identityHash = {};
      	if (!hook.receipts.identities) {
      	  createJob(message, recipients, {});
      	} else {
      	  if (!(hook.receipts.identities instanceof Function)) {
      	    hook.receipts.identities = getUserFromIdentities;
      	  }
      	  var getUser = hook.receipts.identities;
      	  var count = 0;
      	  identities.forEach(function(userId) {
      	    getUser(userId, function(err, data) {
      	      identityHash[userId] = data;
      	      count++;
      	      if (count === identities.length) createJob(message, recipients, identityHash);
      	    })
      	  });
      	}
      }
    }

    function createJob(message, recipients, identities) {
      queue.createJob(hook.originalName, {
        message: message,
        recipients: recipients,
        identities: identities
      }).attempts(10).backoff( {type:'exponential', delay: 1000} )
      .save(function(err) {
        if (err) console.error(new Date().toLocaleString() + ': ' + hook.name + ': Unable to create Kue process: ', err );
      });
    }
  });
};
