// libs
var util = require('util');
var axios = require('axios');
var _ = require('lodash');
var config = require('../config.js');
var NodeCache = require("node-cache");
var nr = require('newrelic');

// Gloabl setup
var vstsCache = new NodeCache();
var createdCache = new NodeCache();
var reviewersCache = new NodeCache();
var regex_name = new RegExp('^(.*)(?:' + config.vsts.emailDomain + ')$');

var REPOSITORIES_RESOURCE = '/git/repositories';
var PULL_REQUEST_RESOURCE = '/git/repositories/%s/pullrequests';
var PULL_REQUEST_RESOURCE_REVIEWER = PULL_REQUEST_RESOURCE + '?reviewerId=%s';
var PULL_REQUEST_RESOURCE_CREATOR = PULL_REQUEST_RESOURCE + '?creatorId=%s';
var TEAMS_RESOURCE = '/projects/SoftwareDevelopment/teams';
var TEAM_MEMBERS_RESOURCE = TEAMS_RESOURCE + '/%s/members'

// Gloabl Axios Settings
axios.defaults.baseURL = config.vsts.baseURL;
axios.defaults.auth = {
  username: config.vsts.username,
  password: config.vsts.password
};

//TODO: Change token
//TODO: Build the caches in parallel

refreshCache();
setInterval(nr.createBackgroundTransaction('refresh:cache', refreshCache), 1000 * 300); //5 mins

function refreshCache() {
  axios.get(TEAMS_RESOURCE)
    .then(function(res) {
      var teams = _.map(res.data.value, _.partialRight(_.pick, ['id', 'name']));
      axios.all(getTeamMembers(teams))
        .then(function(results) {

          _.forEach(results, function(x) {

            var teamId = x.config.url.match(/(?:teams\/)(.*)(?:\/members)/)[1];
            if (x.data.count > 0) {
              _.forEach(x.data.value, function(y) {

                var match = y.uniqueName.match(regex_name);
                if (match !== null) {

                  var member = config.members[match[1]] ? config.members[match[1]] : match[1];
                  vstsCache.set(member, {
                    teamId: teamId,
                    memberId: y.id
                  });

                }
              });
            }
          });

          // Load all the repositories and pull requests
          axios.get(REPOSITORIES_RESOURCE)
            .then(function(res) {
              // Get all repository data
              var repos = _.map(res.data.value, _.partialRight(_.pick, ['id', 'name', 'remoteUrl']));
              axios.all(getPullRequests(repos))
                .then(function(results) {

                  // Order by the PRs created date
                  var sorted = _.orderBy(_.flatMap(results, "data.value"), "creationDate", "desc");

                  var createdByArr = {};
                  var reviewersArr = {};

                  _.forEach(sorted, function(pr) {

                    var remote = _.find(repos, ['id', pr.repository.id]);
                    var attachment = {
                      color: "#00b159",
                      title: '#' + pr.pullRequestId,
                      title_link: util.format('%s/pullrequest/%s?view=discussion', remote.remoteUrl, pr.pullRequestId),
                      text: util.format('%s - %s', remote.name, pr.title),
                      fields: [{
                        title: 'Created by',
                        value: pr.createdBy.displayName,
                        short: true
                      }]
                    };

                    var createdBy = createdByArr[pr.createdBy.id];
                    if (createdBy == undefined) {
                      createdBy = [attachment];
                    } else {
                      createdBy.push(attachment);
                    }
                    createdByArr[pr.createdBy.id] = createdBy;

                    var team_attachment = _.merge({}, attachment, {
                      color: "#f37735"
                    });
                    _.forEach(pr.reviewers, function(reviewer) {
                      var reviewBy = reviewersArr[reviewer.id];
                      if (reviewBy == undefined) {
                        reviewBy = [team_attachment];
                      } else {
                        reviewBy.push(team_attachment);
                      }
                      reviewersArr[reviewer.id] = reviewBy;
                    });
                  });

                  //Reload the caches with the temps
                  _.forEach(createdByArr, function(value, key) {
                    createdCache.set(key, value);
                  });
                  _.forEach(reviewersArr, function(value, key) {
                    reviewersCache.set(key, value);
                  });

                  console.log('member cache loaded!');
                  nr.endTransaction();
                });
            });
        });
    });
};

function getRepositoriesCache() {
  var repos = vstsCache.get("repos");
  if (repos == undefined) {
    return axios.get('/git/repositories')
      .then(function(res) {
        // Set the cahche
        vstsCache.set("repos", res.data.value, 14400); // 4 hrs

        return new Promise((resolve, reject) => {
          return resolve(res.data.value);
        });
      });
  } else {
    return new Promise((resolve, reject) => {
      return resolve(repos);
    });
  }
};

function getTeamMembers(teams) {
  return _.map(teams, function(team) {
    return axios.get(util.format(TEAM_MEMBERS_RESOURCE, team.id));
  });
};

function getPullRequests(repos) {
  return _.map(repos, function(repo) {
    return axios.get(util.format(PULL_REQUEST_RESOURCE, repo.id));
  });
};

module.exports = function(req, res, next) {

  //Only allow chats from ce teams
  if (_.indexOf(config.teamTokens, req.body.token) === -1) {
    return res.status(200).json({
      text: 'Sorry dude, your team is not authorized',
      icon_emoji: ':cry:'
    });
  }

  var member = vstsCache.get(req.body.user_name);
  if (member == undefined) {
    return res.status(200).json({
      text: 'Sorry dude, your username was not found',
      icon_emoji: ':cry:'
    });
  }

  var isTeamOption = req.body.text == 'team';
  var message, attachments;

  if (isTeamOption) {
    attachments = reviewersCache.get(member.teamId);
    message = 'Active pull requests for your team:';

    if (_.isUndefined(attachments)) {
      message = 'Done and done, no active pull requests for your team';
      attachments = null;
    }
  } else {
    message = 'Active pull requests for you:';
    attachments = _.concat(createdCache.get(member.memberId) || [], reviewersCache.get(member.memberId) || [])

    if (_.isEmpty(attachments)) {
      message = 'Done and done, you have no active pull requests';
      attachments = null;
    }
  }

  return _.isEmpty(attachments) ?
    res.status(200).json({
      response_type: "ephemeral",
      text: message,
      icon_emoji: ':the_horns:'
    }) :
    res.status(200).json({
      response_type: "ephemeral",
      text: message,
      attachments: attachments
    });
}
