# slack-bot-vsts-pullrequests

A Slack bot that gathers all the pull requests from all repositories in Visual Studio Team Services
===============================

## Build

`npm install`

## Run

`npm server.js`

## Test
`curl -X POST --data "token=<slack_token>&user_name=mbukosky" http://localhost:3000/pullrequest`
