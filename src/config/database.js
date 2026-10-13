require('./loadEnv');

// Every email being sent holds a connection until SMTP answers (its row stays locked), so the
// pool leaves room for the requests being built and for the scheduler and sweep jobs. With the
// default of 5 the sends alone could take every connection.
const sendConcurrency = parseInt(process.env.EMAIL_CONCURRENCY, 10) || 5;
const buildConcurrency = parseInt(process.env.EMAIL_REQUEST_CONCURRENCY, 10) || 2;

// Same database and variable names as the API.
module.exports = {
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: process.env.DB_DIALECT,
  // The jobs poll the database; logging every query would bury the useful output.
  logging: false,
  pool: {
    max: sendConcurrency + buildConcurrency + 2,
  },
};
