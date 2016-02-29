/**
 * Sets up a simple webhook listening on /conversation-participant-change
 * and adds a message to the conversation announcing the change in participants.
 *
 * NOTE: The Platform API needs to tell us which participants have joined or left.
 * This demo can only indicate for now that the participants have changed.
 * A better implementation might have tracked the prior participant list so that changes could
 * explained to users.
 */

module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();

  var hook = {
    name: 'conversation-participant-change demo',
    path: '/conversation-participant-change',
    events: ['conversation.updated.participants'],
  };

  /**
   * Process each conversation received by the webhook
   */
  queue.process(hook.name, 50, function(job, done) {
    try {
      var conv = job.data.conversation;
      var conversationId = conv.id;
      console.log(new Date().toLocaleString() + ': ' + hook.name + ': announcing participant change');
      layerClient.messages.sendTextFromName(conversationId, 'Welcome-bot',
        'Participants have left or joined this conversation...');
    } finally {
      done();
    }
  });

  return hook;
};
