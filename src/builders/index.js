const builders = {
  postgres: {
    emailExecutionBuilder: require('./postgres/emailExecutionBuilder'),
  },
};

module.exports = builders.postgres;
