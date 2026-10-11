jest.mock('../../models', () => ({
  sequelize: { transaction: callback => callback('transaction') },
}));
jest.mock('../../queries/emailExecutionQuery');
jest.mock('../../services/emailService');

const emailExecutionQuery = require('../../queries/emailExecutionQuery');
const emailService = require('../../services/emailService');
const emailExecutionService = require('../../services/emailExecutionService');

describe('emailExecutionService.processExecution', () => {
  const execution = {
    id: 7,
    emailId: 3,
    to: 'a@example.com',
    cc: null,
    bcc: null,
    subject: 'Hello',
    body: '<p>Hi</p>',
    priority: 'normal',
    headers: { 'List-Unsubscribe': '<https://zapp.example.com/api/email/track/unsubscribe/x>' },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    emailExecutionQuery.getAttachments.mockResolvedValue([
      { fileName: 'a.pdf', mimeType: 'application/pdf', fileBuffer: Buffer.from('pdf') },
    ]);
  });

  it('should skip a row that is no longer on queue', async () => {
    emailExecutionQuery.lockOnQueue.mockResolvedValue(null);

    await expect(emailExecutionService.processExecution(7)).resolves.toEqual({
      status: 'skipped',
    });
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(emailExecutionQuery.finish).not.toHaveBeenCalled();
  });

  it('should send the row with its attachments and mark it sent', async () => {
    emailExecutionQuery.lockOnQueue.mockResolvedValue(execution);
    emailService.sendEmail.mockResolvedValue({ messageId: '<id@example.com>' });

    await expect(emailExecutionService.processExecution(7)).resolves.toEqual({
      status: 'success',
      errorMessage: null,
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        html: '<p>Hi</p>',
        headers: execution.headers,
        attachments: [
          { filename: 'a.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
        ],
      }),
    );
    expect(emailExecutionQuery.finish).toHaveBeenCalledWith(7, 'success', null, 'transaction');
  });

  it('should mark the row failed with the SMTP error', async () => {
    emailExecutionQuery.lockOnQueue.mockResolvedValue(execution);
    emailService.sendEmail.mockRejectedValue(new Error('Connection refused'));

    await expect(emailExecutionService.processExecution(7)).resolves.toEqual({
      status: 'failed',
      errorMessage: 'Connection refused',
    });
    expect(emailExecutionQuery.finish).toHaveBeenCalledWith(
      7,
      'failed',
      'Connection refused',
      'transaction',
    );
  });
});
