import { createTestAccount, getTestMessageUrl } from 'nodemailer';

(async () => {
  const account = await createTestAccount();
  console.log('\n=== Ethereal account created ===');
  console.log('SMTP_HOST=' + account.smtp.host);
  console.log('SMTP_PORT=' + account.smtp.port);
  console.log('SMTP_USER=' + account.user);
  console.log('SMTP_PASS=' + account.pass);
  console.log('PREVIEW_URL=' + getTestMessageUrl({}));
  console.log('\nOpen https://ethereal.email to see sent messages.\n');
})();