'use strict';

require('../config/loadEnv');
const Sequelize = require('sequelize');
const config = require('../config/database');
const db = {};

const sequelize = new Sequelize(config.database, config.username, config.password, config);

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
