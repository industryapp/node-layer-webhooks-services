/**
 * Create listeners for each of your webhooks that will create a Kue process for processing each new webhook event.
 *
 *     var kue = require('kue'),
 *         queue = kue.createQueue();
 *
 *     layerWebhooks.listen({
 *        expressApp: app,
 *        secret: 'Frodo is a Dodo',
 *        hooks: [
 *          {
 *            name: 'Message Read Monitor',
 *            path: '/message-read-monitor',
 *            events: ['message.read'],
 *            delay: '1s'
 *          },
 *          {
 *            name: 'Conversation Create Monitor',
 *            path: '/conversation-create-monitor',
 *            events: ['conversation.create']
 *          }
 *       ]
 *     });
 *
 *     queue.process('Message Read Monitor', 50, function(job, done) {
 *       handleReadMessageEvents(job, done);
 *     });
 *
 *     queue.process('Conversation Create Monitor', 50, function(job, done) {
 *       handleNewConversationEvents(job, done);
 *     });
 *
 *
 * @param {Express App} expressApp - An instance of an express app; needed to create .get() and .post() listeners for the webhook requests
 * @param {String} secret - String known only to your company for use validating
 *                          that requests to your webhook endpoints come from authorized sources.
 * @param {Object[]} hooks - Array of hook definitions with callbacks
 * @param {String} hooks.name - A unique name or ID for your webhook; used for the Kue job name and for logging
 * @param {String} hooks.path - Path extension to your url for listening to these webhooks;
 *                              this is where the express app will be listening for this hook.
 * @param {String|Number} hooks.delay - Delay before creating the queue process.  If number, ms to wait. If string, see https://www.npmjs.com/package/ms
 *
 * Your jobs.data will contain:
 * @param {String} timestamp - Time at which the event occurred
 * @param {String} type - One event type 'message.sent', 'conversation.deleted', etc.
 * @param {Object} conversation - If this is a Conversation event, then a full REST Conversation object will be contained here
 * @param {Object} message - If this is a Message event, then a full REST Message object will be contained here
 */
var ms = require('ms');
var crypto = require('crypto');
var kue = require('kue');
var queue = kue.createQueue();
var jsonParser = require('body-parser').json({type: 'application/vnd.layer.webhooks+json'});
var Debug = require('debug');

module.exports = function(options) {
  var app = options.expressApp;
  var secret = options.secret;
  var hooks = options.hooks;

  /**
   * Setup each hook definition so that we listen for validation
   * and events.
   */
  hooks.forEach(function(hookDef) {
    var webhookName = hookDef.name;
    var logger = Debug('layer-webhooks-services:' + webhookName.replace(/\s/g,'-'));
    var loggerError = Debug('layer-webhooks-services-error:' + webhookName.replace(/\s/g,'-'));
    var path = hookDef.path;
    if (path.indexOf('/') !== 0) path = '/' + path;
    var delay = hookDef.delay ? ms(hookDef.delay) : 0;

    /**
     * Listen for verifcation requests. These requests are sent by Layer Services when
     * first registering a webhook... or when activating a disabled webhook.
     */
    app.get(path, function(req, res) {
      logger('Received Verification Challenge');
      if (req.query.verification_challenge) {
        return res.send(req.query.verification_challenge);
      }
      res.sendStatus(200);
    });

    /**
     * Listen for webhook events and respond with 200.
     * accumulated events.
     */
    app.post(path, jsonParser, handleValidation, function(req, res) {
      logger('Received webhook for ' + req.body.event.type);

      // We are receiving events for a different webhook; common occurance during development after tweaking
      // a webhook name.  After tweaking a name you will now have two webhooks; returning an error here
      // causes the older one to become inactive rather than sending us double the number of events.
      if (req.body.config.name != webhookName && webhookName.indexOf(req.body.config.name + ':') !== 0) {
      	console.error(new Date().toLocaleString() + ': ' + webhookName + ' received event meant for ' + req.body.config.name + '; returning error to server');
      	return res.sendStatus(400);
      }

      // Only respond to conversation events or to messages NOT sent via Platform API.
      // Responding to bots could create an infinite bot loop
      if (!req.body.message || req.body.message.sender.user_id) {
        queue.createJob(webhookName, {
          title: webhookName,
          timestamp: req.body.event.created_at,
          type: req.body.event.type,
          conversation: req.body.conversation,
          message: req.body.message
        }).delay(delay).attempts(10).backoff({
          type: 'exponential',
          delay: 10000
        }).save( function(err){
           if( err ) {
            console.error('Unable to create Kue process: ', err );
          }
        });
      }

      res.sendStatus(200);
    });



    /**
     * Validate that the request comes from Layer services by comparing the secret
     * provided when registering the webhook with the 'layer-webhook-signature' header.
     */
    function handleValidation(req, res, next) {
      var payload = JSON.stringify(req.body);
      var utf8safe = unescape(encodeURIComponent(payload));
      var hash = crypto.createHmac('sha1', secret).update(utf8safe).digest('hex');
      var signature = req.get('layer-webhook-signature');

      if (hash === signature) next();
      else {
        loggerError('Computed HMAC Signature ' + hash + ' did not match signed header ' + signature + '. Returning Error.  Config:', JSON.stringify(payload.config));
        res.sendStatus(403);
      }
    }
  });
};
