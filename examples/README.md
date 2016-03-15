# Examples

There are a number of examples in this folder. Take a look at the [basic services](./basic-services) and the [receipts services](./receipts-services).


## Running in Heroku

1. Get the repo: `git clone git@github.com:layerhq/node-layer-webhooks-services.git`
2. CD into folder: `cd node-layer-webhooks-services`
3. Create the Heroku App: `heroku create`
4. Deploy to Heroku: `git push heroku master`
5. Configure your App ID: `heroku config:set LAYER_APP_ID=YOUR_APP_ID`
6. Configure your Authentication Token: `heroku config:set LAYER_BEARER_TOKEN=YOUR_TOKEN`
7. Configure your Logger: `heroku config:set 'DEBUG=*,-body-parser:json, -express:*'`
8. Configure your Hostname: `heroku config:set HOST=$(heroku apps:info -s  | grep web-url | cut -d= -f2)`
9. Install `heroku-redis`: Instructions at https://devcenter.heroku.com/articles/heroku-redis#installing-the-cli-plugin

You should now be able to send messages, change conversation titles, and see the webhook examples respond.


## Running on Your Server

1. Get the repo: `git clone git@github.com:layerhq/node-layer-webhooks-services.git`
2. CD into folder: `cd node-layer-webhooks-services`
3. Install root dependencies: `npm install`
4. CD into the examples folder: `cd examples`
5. Install example dependencies `npm install`
6. Setup an `ssl` folder with your certificate; your ssl folder should have:
  * server.key
  * server.crt
  * ca.crt
7. Setup your .env file to have the following values:
  * `HOST`: Your server host name or IP
  * `WEBHOOK_PORT`: The port your server will receive requests on (defaults to 443 if unset)
  * `LAYER_BEARER_TOKEN`: You can find your Bearer Token on Layer's Developer Dashboard, in the `keys` section.
  * `LAYER_APP_ID`: Your layer app id; you can find this on the same page as your bearer token
  * `REDIS_URL`: Only needed if your not running redis locally.
8. Run the server: `npm start`
