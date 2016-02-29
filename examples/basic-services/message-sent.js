/**
 * Sets up a simple webhook listening on /message-sent
 *
 * This webhook has a setup of keywords it listens for and responds in the conversation to occurances of these keywords.
 */

module.exports = function (layerClient) {
  var kue = require('kue');
  var queue = kue.createQueue();

  var hook = {
    name: 'message-sent demo',
    path: '/message-sent',
    events: ['message.sent'],
  };

  /**
   * Get the text from a Message.
   */
  function getText(msg) {
    return msg.parts.filter(function (part) {
      return part.mime_type === 'text/plain';
    }).map(function (part) {
      return part.body;
    }).join('; ');
  }

  /**
   * Process each message that is sent; If any message text matches any of our action keywords,
   * Execute the action.
   */
  queue.process(hook.name, 50, function(job, done) {
    try {
      var msg = job.data.message;
      var text = getText(msg);

      for (var key in actions) {
        var regex = new RegExp('\\b' + key + '\\b', 'i');
        if (regex.test(text)) actions[key](msg, text);
      }
    } catch(e) {
      return done(e);
    }
    done();
  });

  /**
   * Actions is the hash of keywords we respond to and the callbacks for handling those keywords
   */
  var actions = {
    die: rollTheDie,
    eat: foodTalk,
  };

  /**
   * If someone sends the phrase "die 5" roll the dice 5 times and report the results
   */
  function rollTheDie(msg, text) {
    var conversationId = msg.conversation.id;

    var matches = text.match(/die (\d+)/i);
    if (matches && matches[1]) {
      var dieCount = Number(matches[1]);
      var result = [];
      if (dieCount > 20) {
        layerClient.messages.sendTextFromName(conversationId, 'Die-bot', 'So much death is a terrible thing to ask of me. You should be ashamed!');
      } else {
        for (var i = 0; i < dieCount; i++) {
          result.push(Math.floor(Math.random() * 6) + 1); // Simple 6 sided die
        }
        layerClient.messages.sendTextFromName(conversationId, 'Die-bot', 'Rolled a ' + result.join(', ').replace(/(.*),(.*)/, '$1 and$2'));
      }
    }
  }

  /**
   * If someone sends any phrase that has the word eat in it, respond with some food talk...
   */
  function foodTalk (msg, text) {
    var conversationId = msg.conversation.id;

    var matches = text.match(/eat my (.+?)\b/i);
    if (matches) {
      layerClient.messages.sendTextFromName(conversationId, 'Food-bot', 'My ' + matches[1] + ' taste a lot better than yours');
    } else {
      var messages = [
        'I\'m eating yummy carbon',
        'I\'m eating yummy silicon',
        'I\'m eating your keyboard. Yummy!',
        'I\'m nibbling on your screen. Sorry about the dead pixels.',
        'I\'m eating your fingers.  Seriously, you should get more of these!',
        'Feed me....'
      ];
      layerClient.messages.sendTextFromName(conversationId, 'Food-bot', messages[Math.floor(Math.random() * 6)]);
    }
  }

  return hook;
};
