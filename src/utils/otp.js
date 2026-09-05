function generateCode() {
  if (process.env.OTP_DEV_MODE === 'true') return '0000';
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function sendSms(phone, code) {
  if (process.env.OTP_DEV_MODE === 'true') {
    console.log(`[otp:dev] OTP for ${phone} is ${code}`);
    return true;
  }
  console.log(`[otp] (no provider configured) OTP for ${phone} is ${code}`);
  return true;
}

module.exports = { generateCode, sendSms };
