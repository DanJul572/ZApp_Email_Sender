const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['app.js'],
    bundle: true,
    platform: 'node',
    outfile: 'dist/app.js',
    target: 'node22',
    minify: false,
    sourcemap: true,
    external: [
      // database drivers
      'pg',

      // pg ecosystem
      'pg-hstore',

      // orm
      'sequelize',

      // mail
      'nodemailer',
    ],
  })
  .catch(() => process.exit(1));
