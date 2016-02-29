/**
 * Sets up a simple webhook listening on /message-delete
 * Sends a message to the Conversation indicating whenever something has been deleted.
 * No. You probably don't want to do this to your users.
 *
 * NOTE: What would be a little better is to say "XXX has deleted a message", but that would
 * require building in concepts of identity into this demo.
 */
module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();

  var hook = {
    name: 'message-delete demo',
    path: '/message-delete',
    events: ['message.deleted'],
  };

  /**
   * Extract the text from a message
   */
  function getText(msg) {
    return msg.parts.filter(function (part) {
      return part.mime_type === 'text/plain';
    }).map(function (part) {
      return part.body;
    }).join('; ');
  }

  /**
   * Process each conversation received by the webhook
   */
  queue.process(hook.name, 50, function(job, done) {
    try {
      var msg = job.data.message;
      var text = getText(msg);

      var conversationId = msg.conversation.id;
      if (text) {
        console.log(new Date().toLocaleString() + ': ' + hook.name + ': sending');
        layerClient.messages.sendTextFromName(conversationId, 'Delete-bot', 'The following message was deleted: ' + text);
      }
    } finally {
      done();
    }
  });

  return hook;
};
