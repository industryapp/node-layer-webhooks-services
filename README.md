# Layer Webhooks Services

[![npm version](http://img.shields.io/npm/v/layer-webhooks-services.svg)](https://npmjs.org/package/layer-webhooks-services)

The Layer Webhooks services integrates with the [Layer's services](http://layer.com), allowing for event handling when messages and conversations are created, deleted and changed. This node module is designed to work with express servers to quickly register and listen for events.

## Installation

    npm install layer-webhooks-services

## Usage

There are two types of services provided by this module:

* Registering webhooks
* Listening for webhooks

> Registering webhooks is an optional step, webhooks can also be registered from the [Developer Dashboard](https://developer.layer.com).

## Setup

The Layer Webhooks Service depends upon [Kue](https://github.com/Automattic/kue) for managing jobs spawned by receiving a webhook. It is backed by Redis, which is also used by the Receipts service.  Initialization therefore will looks something like:

```javascript
var redis = require('redis').createClient(process.env.REDIS_URL);
var queue = require('kue').createQueue({
  redis: process.env.REDIS_URL
});

var WebhooksServices = require('layer-webhooks-services');
var lws = new WebhooksServices({
  token: process.env.LAYER_BEARER_TOKEN,
  appId: process.env.LAYER_APP_ID,
  redis: redis
});
```

> Note that Kue's `createQueue` function returns a singleton; this first call, and its parameters, define
the singleton that will be used throughout this module.

### Registering a webhook

```javascript
var webhook = {
  name: 'Webhook Example',  // An arbitrary name for your webhook
  path: '/webhook_example', // Your server URL path for the webhook
  events: ['message.sent']  // Events this webhook is listening to
};

// Register a webhook
lws.register({
  secret: 'my secret',
  url: 'https://mydomain.com/webhook',
  hooks: [webhook]
});
```

Running the above code will cause one of two results:

  1. A webhook will be registered on Layer's servers telling it what events are of interest,
  and what url to send those events to.
  2. If a webhook with the specified name already exists, the call to register will verify that the
  webhook is active, and will activate it if needed.

### Listening for a webhook

```javascript
var kue = require('kue');
var queue = kue.createQueue();

var express = require('express');
var app = express();

var webhook = {
  name: 'Webhook Example',
  path: '/webhook_example'
};

// Listen for a webhook
lws.listen({
  expressApp: app,
  secret: 'my secret',
  hooks: [webhook]
});

queue.process(webhook.name, function(job, done) {
  var webhookEvent = job.data;
  var message = webhookEvent.message;
  console.log('Message Received from: ' + message.sender.user_id);
});
```

The code above does two things:

  1. It sets up an endpoint listening for GET requests used by Layer's services to [validate](https://developer.layer.com/docs/webhooks#validate) an endpoint.  Validation is requried before Layer will start sending events to this service.
  2. It sets up an endpoint listening for events, and setting up a Kue process for you to handle those events.

Notes:

  * If you use the `listen` method, it requires an [Express App](http://expressjs.com/).
  * It is required that your Express server listens to secure SSL request i.e. use `HTTPS`.
  * The `path` property of your webhook definition is used to specify the path that the server will listen for requests at.

### Combined Usage

While you can register a webhook on Layer's Developer Dashboard and only use `listen()`, you can also use
the following combined usage:

```javascript
var webhook = {
  name: 'Webhook Example',
  events: ['message.sent'],
  path: '/webhook_example'
};

var secret = 'my secret';

lws.register({
  secret: secret,
  url: 'https://mydomain.com/webhook',
  hooks: [webhook]
});

lws.listen({
  expressApp: app,
  secret: secret,
  hooks: [webhook]
});

queue.process(webhook.name, function(job, done) {
  var webhookEvent = job.data;
  var message = webhookEvent.message;
  console.log('Message Received from: ' + message.sender.user_id);
});
```

### Listening for Unread or Undelivered Messages

A common use case is to listen for Messages that have been unread or undelivered for some period of time and then notifying people that they have a message waiting for them (or that their message could not be delivered to all participants).

The `receipts` operation provides shorthand for this.  It is basically the same as the `listen` operation, but supports parameters specific managing delayed testing of receipt status.

```javascript
var webhook = {
  name: 'Inline Receipts Demo',

  // Path for express app to listen on
  path: '/receipts',

  // These events are needed for the register call
  events: ['message.sent', 'message.read', 'message.delivered', 'message.deleted'],

  receipts: {
    // How long to wait before checking if the Message is still unread
    delay: '10 minutes',

    // Any user whose recipient status is 'sent' or 'delivered' (not 'read')
    // is of interest once the delay has completed.
    recipient_status_filter: ['sent', 'delivered']
  }
};

var secret = 'my secret';

lws.register({
  secret: secret,
  url: 'https://mydomain.com/webhook',
  hooks: [webhook]
});

// Listen for events from Layer's Services
lws.receipts({
  expressApp: app,
  secret: secret,
  hooks: [webhook]
});

// Any Messages that are unread by any participants will be passed into this job
// after the delay specified above has passed.
queue.process(webhook.name, function(job, done) {
  var message = job.data.message;
  var recipients = job.data.recipients;

  console.log('Receipts Sample: The following users didn\'t read message ' + message.id + ' (' + message.parts[0].body + '): ');
  console.log('Receipts Sample: RECIPIENTS: ' + recipients.join(', '));
  done();
});
```

## The Hook Definition

Each hook can have the following properties:

  * `name`: This can be an arbitrary string; the name will be used to help identify a webhook so that only a single instance of this webhook is ever created.
  * `events`: An array of events that are of interest to our webhook. Refer to [documentation](https://developer.layer.com/docs/webhooks) for a list of all events.
  * `path`: The path is used both to tell Layer's servers where to send webhook events to, and tells the `listen()` method where to listen for incoming events.

## Initialization

### new WebhooksServices(config)

Layer Webhooks services constructor is initialized with the following configuration values:

  - `token` - Layer Platform API token which can be obtained from [Developer Dashboard](https://developer.layer.com)
  - `appId` - Layer application ID
  - `redis` - [Redis](https://github.com/NodeRedis/node_redis) client instance

### lws.register(options)

Register your webhooks with Layer's servers.

  * `secret`: An arbitrary string you provide used to validate that events received by your server come from Layer's Servers, and not some unknown source.
  * `url`: When registering a webhook with Layer's services, the `url` + each webhook's `path` property is used to tell the server where to send each event.
  * `hooks`: An array of Hook Definitions.

### lws.listen(options)

Listen for incoming events from Layer's servers.

  * `expressApp`: An expressjs application instance.
  * `secret`: An arbitrary string you provide used to validate that events received by your server come from Layer's Servers, and not some unknown source.
  * `hooks`: An array of Hook Definitions.

### lws.receipts(options)

Listen for incoming events from Layer's servers, and trigger a job if after
a specified delay, there are recipients whose state matches your `states` parameter.

This call uses the `listen` operation, but has an extra `receipts` parameter:

  * `expressApp`: An expressjs application instance.
  * `secret`: An arbitrary string you provide used to validate that events received by your server come from Layer's Servers, and not some unknown source.
  * `hooks`: An array of Hook Definitions.

Custom Hook Parameters:

  * `receipts`: Parameters specific to the receipts operation:
    * `delay`: If its a number, then its the number of milliseconds to wait before creating the job for you to process.  If its a string, then see [this utility](https://www.npmjs.com/package/ms) for how this is processed.
    * `recipient_status_filter`: Array of strings; this call should report on all recipients whose state matches any of the states you list. Possible values are 'sent', 'delivered', 'read'.  ['sent'] will report on all recipients who are still in 'sent' state for triggering 'undelivered' processing.  ['sent', 'delivered'] will report on all users who are either 'sent' OR 'delivered' meaning anyone who hasn't read the Message.

## Webhook Events

Your callbacks will be called with Events objects provided by Layer Services. Make sure you read the Layer [Webhooks Documentation](https://developer.layer.com/docs/webhooks) to get more information.

## Examples

There are a number of examples in the [examples](./examples) folder.  You can run them all with `npm start`, or just run the basic examples with `npm run basic`.

## Contributing

Layer API is an Open Source project maintained by Layer. Feedback and contributions are always welcome and the maintainers try to process patches as quickly as possible. Feel free to open up a Pull Request or Issue on Github.
