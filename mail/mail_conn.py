
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import smtplib
# import email
import os
from cryptography.fernet import Fernet


def decrypt_key_token(decrypt_key, decrypt_token):
    fnet = Fernet(decrypt_key.encode("utf-8"))
    return fnet.decrypt(decrypt_token.encode("utf-8")).decode('utf-8')


def send_email(
    sender: str = 'krishna.kunal@intel.com',
    recipients: str | list[str] | None = None,
    subject: str = 'Test Email',
    email_body: str = 'Test Email Sent',
    attachments: str | list[str] | None = None,
    smtp_password: str | None = None,
):

    recipient_list = ["krishna.kunal@intel.com"] if recipients is None else recipients
    if isinstance(recipient_list, str):
        recipient_list = [recipient_list]
    if not recipient_list:
        raise ValueError("At least one recipient is required")

    msg = MIMEMultipart('mixed')
    msg['From'] = sender
    msg['To'] = ", ".join(recipient_list)
    msg['Subject'] = subject
    msg.attach(MIMEText(email_body, 'plain'))

    if attachments:
        attachment_list = [attachments] if isinstance(attachments, str) else attachments
        for attachment in attachment_list:
            with open(attachment, 'rb') as f:
                extension = os.path.splitext(attachment)[1].lower()
                subtype = {'.json': 'json', '.csv': 'csv'}.get(extension, 'octet-stream')
                file_attachment = MIMEApplication(f.read(), _subtype=subtype)
                file_attachment.add_header(
                    'Content-Disposition', 'attachment', filename=os.path.basename(attachment))
                msg.attach(file_attachment)

    if sender == 'krishna.kunal@intel.com':
        smtp_server = "SMTPAUTH.INTEL.COM"
        password = smtp_password or os.getenv('SMTP_PASSWORD')
        if not password:
            raise ValueError("Set SMTP_PASSWORD or pass smtp_password to send_email()")
        with smtplib.SMTP(smtp_server, 587, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(sender, password)
            smtp.sendmail(sender, recipient_list, msg.as_string())
    else:
        with smtplib.SMTP(host='smtp.intel.com', timeout=30) as smtp:
            smtp.sendmail(sender, recipient_list, msg.as_string())


# if __name__ == '__main__':

#     send_email(sender='xpiv-telemetry@intel.com', subject='Test Email',
#                email_body=' Testing account access to send mail')
