/**
 * Sets up a simple webhook listening on /conversation-create
 * and sends a message into each newly creatd conversation saying "Starting a dialog with xxx user(s)".
 *
 * Future Work: Ideally we'd announce WHO you are in a conversation with, but each app will have its own
 * identity models for getting a displayable name from a userId.
 */

module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();

  var hook = {
    name: 'conversation-create demo',
    path: '/conversation-create',
    events: ['conversation.created'],
  };

  /**
   * Process each conversation received by the webhook
   */
  queue.process(hook.name, 50, function(job, done) {
    try {
      var conversation = job.data.conversation;
      var conversationId = conversation.id;

      // There are 4 people, so you are talking to 3 other people
      var count = conversation.participants.length - 1;
      var users = (conversation.participants.length === 2 ? ' user' : ' users');

      // Send a message from 'Welcome-bot' into the new conversation
      console.log(new Date().toLocaleString() + ': ' + hook.name + ': Sending welcome message');
      layerClient.messages.sendTextFromName(
        conversationId,
        'Welcome-bot',
        'Starting a dialog with ' + count + users
      );
    } finally {
      done();
    }
  });

  return hook;
}
