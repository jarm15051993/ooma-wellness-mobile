const base = require('./app.json')

module.exports = {
  ...base.expo,
  android: {
    ...base.expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
}
