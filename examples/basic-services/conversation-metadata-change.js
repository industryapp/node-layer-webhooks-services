/**
 * Sets up a simple webhook listening on /conversation-metadata-change
 * and adds a message to the conversation announcing changes to the title.
 *
 * NOTE: The Platform API needs to tell us which metadata fields have changed;
 * for this demo its assumed there is only a single metadata field called 'conversationName',
 * and only it could have changed.
 */

module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();

  var hook = {
    name: 'conversation-metadata-change demo',
    path: '/conversation-metadata-change',
    events: ['conversation.updated.metadata']
  };

  /**
   * Process each conversation received by the webhook
   */
  queue.process(hook.name, 50, function(job, done) {
    try {
      var conv = job.data.conversation;
      var conversationId = conv.id;
      if (conv.metadata.conversationName) {
        console.log(new Date().toLocaleString() + ': ' + hook.name + ": sending message");
        layerClient.messages.sendTextFromName(conversationId, 'Welcome-bot',
          'The topic has been changed to ' + conv.metadata.conversationName);
      }
    } finally {
      done();
    }
  });

  return hook;
};
