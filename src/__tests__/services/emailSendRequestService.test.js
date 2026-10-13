jest.mock('../../models', () => ({
  sequelize: { transaction: callback => callback('transaction') },
}));
jest.mock('../../queries/emailSendRequestQuery');
jest.mock('../../queries/emailExecutionQuery');
jest.mock('../../services/emailService');
jest.mock('../../services/emailBuilderService');
jest.mock('../../services/emailPublishService');

const emailBuilderService = require('../../services/emailBuilderService');
const emailPublishService = require('../../services/emailPublishService');
const emailService = require('../../services/emailService');
const emailExecutionQuery = require('../../queries/emailExecutionQuery');
const emailSendRequestQuery = require('../../queries/emailSendRequestQuery');
const emailSendRequestService = require('../../services/emailSendRequestService');

describe('emailSendRequestService.processRequest', () => {
  const requestId = '0b6f4c1e-2f4d-4d8e-9a3b-5c6d7e8f9a0b';
  const request = { id: requestId, emailId: 3, trigger: 'manual', testRecipient: null };
  const template = { id: 3, name: 'Welcome', settings: { priority: 'high' } };
  const execution = { emailId: 3, emailName: 'Welcome', to: 'a@example.com', status: 'onQueue' };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    emailSendRequestQuery.claim.mockResolvedValue(request);
    emailSendRequestQuery.lockClaim.mockResolvedValue(true);
    emailService.getEmailById.mockResolvedValue({ id: 3 });
    emailService.getEmailDetail.mockResolvedValue(template);
  });

  it('should skip a request that is not pending', async () => {
    emailSendRequestQuery.claim.mockResolvedValue(null);

    await expect(emailSendRequestService.processRequest(requestId)).resolves.toEqual({
      status: 'skipped',
    });
    expect(emailBuilderService.buildExecutions).not.toHaveBeenCalled();
  });

  it('should save the built emails under the request and publish the ones on queue', async () => {
    emailBuilderService.buildExecutions.mockResolvedValue([
      execution,
      { ...execution, to: null, status: 'failed' },
    ]);
    emailExecutionQuery.insertMany.mockResolvedValue([
      { id: 10, status: 'onQueue' },
      { id: 11, status: 'failed' },
    ]);

    await expect(emailSendRequestService.processRequest(requestId)).resolves.toEqual({
      status: 'done',
      total: 2,
      queued: 1,
    });
    expect(emailBuilderService.buildExecutions).toHaveBeenCalledWith(template, {
      trigger: 'manual',
      testRecipient: null,
    });
    const [rows] = emailExecutionQuery.insertMany.mock.calls[0];
    expect(rows.every(row => row.batchId === requestId)).toBe(true);
    expect(emailSendRequestQuery.finish).toHaveBeenCalledWith(
      requestId,
      'done',
      null,
      'transaction',
    );
    expect(emailPublishService.publish).toHaveBeenCalledWith([10]);
  });

  it('should still finish the request when the broker is down', async () => {
    emailBuilderService.buildExecutions.mockResolvedValue([execution]);
    emailExecutionQuery.insertMany.mockResolvedValue([{ id: 10, status: 'onQueue' }]);
    emailPublishService.publish.mockRejectedValue(new Error('RabbitMQ is not available'));

    await expect(emailSendRequestService.processRequest(requestId)).resolves.toMatchObject({
      status: 'done',
    });
  });

  it('should fail the request and log the reason when the template cannot be built', async () => {
    emailBuilderService.buildExecutions.mockRejectedValue(
      new Error('Merge tag {{name}} uses unknown source "users".'),
    );

    await expect(emailSendRequestService.processRequest(requestId)).resolves.toEqual({
      status: 'failed',
      errorMessage: 'Merge tag {{name}} uses unknown source "users".',
    });
    expect(emailSendRequestQuery.finish).toHaveBeenCalledWith(
      requestId,
      'failed',
      'Merge tag {{name}} uses unknown source "users".',
      'transaction',
    );
    const [[row]] = emailExecutionQuery.insertMany.mock.calls[0];
    expect(row).toMatchObject({
      batchId: requestId,
      emailId: 3,
      emailName: 'Welcome',
      priority: 'high',
      status: 'failed',
      errorMessage: 'Merge tag {{name}} uses unknown source "users".',
    });
    expect(emailPublishService.publish).not.toHaveBeenCalled();
  });

  it('should fail the request when the primary source has no rows', async () => {
    emailBuilderService.buildExecutions.mockResolvedValue([]);

    await expect(emailSendRequestService.processRequest(requestId)).resolves.toMatchObject({
      status: 'failed',
      errorMessage: expect.stringContaining('no one to send this email to'),
    });
  });

  it('should only fail the request when the template was deleted', async () => {
    emailSendRequestQuery.claim.mockResolvedValue({ ...request, emailId: null });

    await expect(emailSendRequestService.processRequest(requestId)).resolves.toMatchObject({
      status: 'failed',
    });
    expect(emailExecutionQuery.insertMany).not.toHaveBeenCalled();
  });

  it('should drop its work when the claim was taken over after the timeout', async () => {
    emailBuilderService.buildExecutions.mockResolvedValue([execution]);
    emailSendRequestQuery.lockClaim.mockResolvedValue(false);

    await expect(emailSendRequestService.processRequest(requestId)).resolves.toEqual({
      status: 'skipped',
    });
    expect(emailExecutionQuery.insertMany).not.toHaveBeenCalled();
    expect(emailPublishService.publish).not.toHaveBeenCalled();
  });
});
