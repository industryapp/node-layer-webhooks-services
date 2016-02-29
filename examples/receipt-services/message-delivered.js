/**
 * Sets up simple webhook listening on /message-delivered
 * which will post a message if 5 minutes pass without anyone receiving the message.
 * This could be used to notify the sender that none of the people they are sending to are avaialable.
 *
 * This webhook caches any newly sent messages in a messages hash, and removes from the cache
 * any time a message is deleted.  If any delivery receipts occur, then someone has received it and
 * there is no need to notify the user; so we delete the message from our hash in that case as well.
 */

module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();
  var redis = require("redis").createClient({
    url: process.env.REDIS_URL
  });
  redis.on('error', function (err) {
      console.log('Error ' + err);
  });

  var hook = {
    name: 'message-delivered demo',
    path: '/message-delivered',
    events: ['message.sent', 'message.delivered', 'message.deleted'],
    delay: '10min',
    receipts: {
      recipient_status_filter: ['sent']
    }
  };

  /**
   * Any Message that remains unread by any recipients for 10 minutes will trigger this
   * process.
   */
  queue.process(hook.name, 50, function(job, done) {
    try {
      var event = job.data;
      var message = event.message;
      var missedRecipients = event.recipients;

      missedRecipients.forEach(function(recipient) {
        console.log(hook.name + ': Unable to deliver message ' + message.id + ' to ' + recipient);
      });
      done();
    } catch(e) {
      done(e);
    }
  });

  return hook;
};
