/**
 * Sets up simple webhook listening on /message-read
 * which will post an announcement to each user who fails to read their messages within 5 minutes.
 * One might instead send email or SMS or handle this some other way as an announcement is probably not
 * the optimal answer.
 *
 * This webhook caches any newly sent messages in a messages hash, and removes from the cache
 * any time a message is deleted.  If a read receipts occur, we update the message in the cache with the latest
 * recipient state data.
 */

module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();


  var hook = {
    name: 'message-read demo',
    path: '/message-read',
    events: ['message.sent', 'message.read', 'message.deleted'],
    delay: '30sec',
    receipts: {
      reportForStatus: ['sent', 'delivered'],
      identities: true
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
      var identities = event.identities;

      missedRecipients.forEach(function(recipient) {
        console.log(hook.name + ': ' + recipient + ' has not read ' + message.id + ', Identity: ' , identities[recipient]);
      });

      done();
    } catch(e) {
      done(e);
    }
  });

  return hook;
};
