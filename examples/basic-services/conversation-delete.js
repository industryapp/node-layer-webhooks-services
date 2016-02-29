/**
 * Sets up a simple webhook listening on /conversation-delete
 * and sends an announcement to all participants notifying them that the Conversation is gone.
 *
 * Future Work: Ideally we'd announce WHO that conversation was with, but that would require building in
 * a concept of identity that may not generalize to all applications.
 *
 * NOTE: Currently the Client API and Web SDK will not receive announcements.
 */

module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();

  var hook = {
    name: 'conversation-delete demo',
    path: '/conversation-delete',
    events: ['conversation.deleted'],
  };

  /**
   * Process each conversation received by the webhook
   */
  queue.process(hook.name, 50, function(job, done) {
    try {
      var conversation = job.data.conversation;

      // actor should be part of the spec but currently is not available.
      // console.log(new Date().toLocaleString() + ': ' + hook.name + ': ' + conversation.id + ' has been deleted by ' + (job.data.actor.user_id || job.data.actor.name));
      console.log(new Date().toLocaleString() + ': ' + hook.name + ': ' + conversation.id + ' has been deleted');
      layerClient.announcements.send({
        'recipients': conversation.participants,
        'sender': {
          'name': 'System Alerts'
        },
        'parts': [{
          mime_type: 'text/plain',
          body: getDescription(conversation)
        }],
        'notification': {
          text: 'Conversation Deleted',
          sound: 'chime.aiff'
        }
      });
    } finally {
      done();
    }
  });

  /**
   * Return a message body describing the deletion
   */
  function getDescription(conversation) {
    if (conversation.metadata.conversationersationName) {
      return 'The Conversation ' + conversation.metadata.conversationersationName + ' has been deleted';
    } else {
      return 'The Conversation with ' +
        conversation.participants.join(', ').replace(/(.*),(.*)/, '$1 and$2') +
        ' has been deleted';
    }
  }

  return hook;
};
