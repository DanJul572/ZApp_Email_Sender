require('./loadEnv');

// Same database and variable names as the API.
module.exports = {
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: process.env.DB_DIALECT,
  // Logging every query would bury the useful output.
  logging: false,
};
