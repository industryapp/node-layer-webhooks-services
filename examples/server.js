/**
 * Webhooks Example Server. Note that Layer will only talk to an https server, so make sure to setup
 * an ssl folder before running.
 */

var express = require('express');
var https = require('https');
var fs = require('fs');

var app = express();

// Setup environmental variables
require('dotenv').load();
if (!process.env.LAYER_BEARER_TOKEN) return console.error('LAYER_BEARER_TOKEN missing in your environmental variables');
if (!process.env.LAYER_APP_ID) return console.error('LAYER_APP_ID missing in your environmental variables');
var PORT = process.env.WEBHOOK_PORT || '443';
var HOST = process.env.HOST || 'localhost';
if (HOST.indexOf('https://') !== 0) HOST = 'https://' + HOST;


// Setup Redis and kue
var redis = require('redis').createClient(process.env.REDIS_URL);
var queue = require('kue').createQueue({
  jobEvents: false,
  redis: process.env.REDIS_URL
});

var SECRET = 'Frodo is a Dodo';

// LayerWebhooks is needed to create a webhooks service
var webhooksServices = require('../src/index');
var webhooksServices = new webhooksServices({
  token: process.env.LAYER_BEARER_TOKEN,
  appId: process.env.LAYER_APP_ID,
  redis: redis
});

// LayerClient is something that we'll use to post messages, and manipulate Conversations
// based on webhook events
var LayerClient = require('layer-api');
var layerClient = new LayerClient({
  token: process.env.LAYER_BEARER_TOKEN,
  appId: process.env.LAYER_APP_ID
});

/**
 * Example shows quick and simple setup of a webhooks service.
 * This example shows a single inline service that logs new messages.
 */
function startInlineServices() {
  // Provide a webhook definition
  var hook = {
    name: 'Inline Sample',
    events: ['message.sent'],
    path: '/inline_sample_message_sent',
  };

  // Register this webhook with Layer's Services
  webhooksServices.register({
    secret: SECRET,
    url: HOST + ':' + PORT,
    hooks: [hook]
  });

  // Listen for events from Layer's Services, and call our callbackAsync with each event
  webhooksServices.listen({
    expressApp: app,
    secret: SECRET,
    hooks: [hook]
  });

  // Setup your callback to handle the webhook events
  queue.process(hook.name, 50, function(job, done) {
    console.log(new Date().toLocaleString() + ': Inline Sample: Message Received from ' + (job.data.message.sender.user_id || job.data.message.sender.name));
    done();
  });
}

function startBasicServices() {
  // Load webhook definitions from our basic-services folder
  var hooks = [
    require('./basic-services/message-delete')(layerClient),
    require('./basic-services/conversation-delete')(layerClient),
    require('./basic-services/conversation-create')(layerClient),
    require('./basic-services/conversation-metadata-change')(layerClient),
    require('./basic-services/conversation-participant-change')(layerClient),
    require('./basic-services/message-sent')(layerClient),
  ];

  // Register the basic webhooks with Layer's Services
  webhooksServices.register({
    secret: SECRET,
    url: HOST + ':' + PORT,
    hooks: hooks
  });

  // Listen for events from Layer's Services
  webhooksServices.listen({
    expressApp: app,
    secret: SECRET,
    hooks: hooks
  });
}

function startReceiptServices() {
  // More complex Webhook Service Scripts:
  var hooks = [
    require('./receipt-services/message-read')(layerClient),
    require('./receipt-services/message-delivered')(layerClient),
  ];

  // Register the complex webhooks with Layer's Services
  webhooksServices.register({
    secret: SECRET,
    url: HOST + ':' + PORT,
    hooks: hooks
  });

  // Listen for events from Layer's Services
  webhooksServices.receipts({
    expressApp: app,
    secret: SECRET,
    hooks: hooks
  });
}

// Presumably you either have the ssl folder setup... or your running on
// heroku where its not required, and we can just use the app variable.
var key, cert, ca, secureServer;
try {
  key = fs.readFileSync('./ssl/server.key');
  cert= fs.readFileSync('./ssl/server.crt');
  ca  = fs.readFileSync('./ssl/ca.crt');

  secureServer = https.createServer({
    key: key,
    cert: cert,
    ca: ca,
    requestCert: true,
    rejectUnauthorized: false
  }, app);
} catch(e) {
  secureServer = app;
}
// Startup the server; allow for a custom heroku PORT
secureServer.listen(process.env.PORT || PORT, function() {
  console.log('Secure Express server listening on port ' + PORT);
  var tasks = process.env.WEBHOOK_SERVER_TASKS ?
    process.env.WEBHOOK_SERVER_TASKS.split(/\s*,\s*/) : ['inline', 'basic', 'receipts'];
  if (tasks.indexOf('inline') !== -1) startInlineServices();
  if (tasks.indexOf('basic') !== -1)  startBasicServices();
  if (tasks.indexOf('receipt') !== -1)  startReceiptServices();
});
