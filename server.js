require('newrelic');
var express = require('express');
var bodyParser = require('body-parser');
var pullRequestBot = require('./bots/pullrequest');

var app = express();
var port = process.env.PORT || 3000;

// body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

// landing route
app.get('/', function (req, res) { res.status(200).send('slack-bot-vsts-pullrequests') });

// bot
app.post('/pullrequest', pullRequestBot);

// basic error handler
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(400).send(err.message);
});

app.listen(port, function () {
  console.log('Slack bot listening on port ' + port);
});
