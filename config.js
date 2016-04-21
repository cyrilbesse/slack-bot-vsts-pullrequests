module.exports = {
  teamTokens: ['slack-team-token'],
  members: {
    mbukosky: 'mikebukosky'
  },
  vsts: {
    emailDomain: process.env.VSTS_EMAIL_DOMAIN || '@example.com',
    baseURL: process.env.VSTS_BASE_URL || 'https://example.visualstudio.com/defaultcollection/_apis',
    username: process.env.VSTS_USERNAME || 'mbukosky@example.com',
    password: process.env.VSTS_PASSWORD || 'TOKEN'
  }
};
