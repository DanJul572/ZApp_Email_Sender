const builders = {
  postgres: {
    emailBuilder: require('./postgres/emailBuilder'),
    emailExecutionBuilder: require('./postgres/emailExecutionBuilder'),
    emailSendRequestBuilder: require('./postgres/emailSendRequestBuilder'),
    emailTrackingBuilder: require('./postgres/emailTrackingBuilder'),
  },
};

module.exports = builders.postgres;
