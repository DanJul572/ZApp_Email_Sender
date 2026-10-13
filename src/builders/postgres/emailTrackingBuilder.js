function getUnsubscribedAddresses() {
  return 'SELECT "address" FROM "emailUnsubscribes" WHERE "emailId" = ?';
}

module.exports = {
  getUnsubscribedAddresses,
};
