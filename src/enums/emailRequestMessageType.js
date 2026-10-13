// "type" of the messages the API sends to this app's email request queue.
module.exports = {
  // { type, requestId }: build the emails of a row of "emailSendRequests".
  build: 'build',
  // { type, executionId }: publish a row of "emailExecutions" to the send email queue again.
  publish: 'publish',
};
