/**
 * Register your webhooks with Layer's Services.
 *
 *     var layerHooks = require('layer-webhooks');
 *     layerHooks.register({
 *        url: 'https://sampledomain.com/myhooks',
 *        secret: 'Frodo is a Dodo',
 *        hooks: [
 *          {
 *            name: 'Message Read Monitor',
 *            events: ['message.sent', 'message.deleted', 'message.read'],
 *            path: '/message-read-monitor'
 *          },
 *          {
 *            name: 'Conversation Create Monitor',
 *            events: ['conversation.create'],
 *            path: '/conversation-create-monitor'
 *          }
 *       ]
 *     });
 *
 * @param {String} url - Base url for all of your webhooks
 * @param {WebhooksClient} webhooksClient - A Client created from the layer-webhooks npm module
 * @param {String} secret - String known only to your company for use validating
 *                          that requests to your webhook endpoints come from authorized sources.
 * @param {Object[]} hooks - Array of webhook definitions
 * @param {String} hooks.name - A unique name or ID for your webhook; used to determine if the webhook already exists.
 *                              This name is an arbitrary string of your choice
 * @param {String[]} hooks.events - Any combination of 'message.sent', 'message.deleted', 'message.read', 'message.delivered', 'conversation.created', 'conversation.deleted', 'conversation.metadata_updated', 'conversation.participants_updated'
 * @param {String} hooks.path - Path extension to your url for listening to these webhooks
 */
module.exports = function(webhooksClient, options) {
  var hooks = options.hooks;
  var url = options.url.replace(/\:443$/,'');
  if (!url.match(/\/$/)) url += '/';
  var secret = options.secret;
  var currentHooks;
  hooks.forEach(function(hook) {
    hook.path = hook.path.replace(/^\//,'');
  });

  webhooksClient.list(function (err, res) {
    if (err) return console.error('Failed to list webhooks: ', err);
    currentHooks = res.body;
    hooks.forEach(registerHook);
  });

  /**
   * Verify that the webhook is active; activate it if its not.
   *
   * @param {Object} hookDef -- A webhook definition object
   * @param {Object} webhook -- A webhook object from Layer
   */
  function verifyWebhook(hookDef, webhook) {
    console.log(hookDef.name + ': webhook already registered: ' + webhook.id + ': ' + webhook.status);
    if (webhook.status !== 'active') {
      console.log(hookDef.name + ': Enabling webhook');
      webhooksClient.enable(webhook.id);
    }
  }

  function registerWebhook(hookDef) {
    console.log(hookDef.name + ': Registering Webhook');
    webhooksClient.register({
      url: url + hookDef.path,
      events: hookDef.events,
      secret: secret,
      config: {
        name: hookDef.name,
      },
    }, function(err, res) {
       if (err) console.error(hookDef.name + ': ' + err);
    });
  }

  function getWebhook(hookDef) {
    return currentHooks.filter(function (webhook) {
      return webhook.config.name === hookDef.name && webhook.target_url === url + hookDef.path;
    })[0];
  }

  function registerHook(hookDef) {
    // Is the webhook already registerd?
    var webhook = getWebhook(hookDef);

    // Verify the webhook is active or register a new webhook
    if (webhook) verifyWebhook(hookDef, webhook);
    else registerWebhook(hookDef);
  }
};
