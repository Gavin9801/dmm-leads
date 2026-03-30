// Dean & Michael Media — Lead Webhook Server
// Deploy on Railway.app (free)
// Required env vars: TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, OWNER_PHONE, META_VERIFY_TOKEN, META_PAGE_TOKEN

const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check — visit your Railway URL to confirm it's running
app.get('/', (req, res) => {
  res.send('Dean & Michael Media Lead Server is running ✅');
});

// Meta webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('Meta webhook verified ✅');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed ❌');
    res.sendStatus(403);
  }
});

// Receive lead from Meta
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately so Meta doesn't retry

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const leadData = changes?.value;
    if (!leadData) {
      console.log('No lead data found in payload');
      return;
    }

    // Fetch full lead details from Meta Graph API
    const leadId = leadData.leadgen_id;
    const pageToken = process.env.META_PAGE_TOKEN;
    const metaRes = await fetch(`https://graph.facebook.com/v18.0/${leadId}?access_token=${pageToken}`);
    const lead = await metaRes.json();
    console.log('Meta lead data:', JSON.stringify(lead));

    // Parse fields
    const fields = {};
    (lead.field_data || []).forEach(f => { fields[f.name] = f.values[0]; });

    const firstName = fields['first_name'] || fields['full_name']?.split(' ')[0] || 'Friend';
    const lastName  = fields['last_name']  || fields['full_name']?.split(' ')[1] || '';
    const phone     = fields['phone_number'] || fields['phone'] || null;
    const email     = fields['email'] || 'N/A';

    console.log(`New lead: ${firstName} ${lastName} | ${phone} | ${email}`);

    // Initialize Twilio lazily (only when needed)
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

    // Build SMS template — swap tokens
    const template = process.env.SMS_TEMPLATE ||
      `Hey ${firstName}! Thanks for reaching out to Dean & Michael Media. Gavin will be in touch with you very shortly! 🙌`;
    const smsBody = template
      .replace(/{first_name}/g, firstName)
      .replace(/{last_name}/g, lastName)
      .replace(/{business}/g, 'Dean & Michael Media');

    // 1. SMS to the lead
    if (phone) {
      await client.messages.create({
        body: smsBody,
        from: process.env.TWILIO_FROM,
        to: phone
      });
      console.log(`SMS sent to lead: ${phone}`);
    } else {
      console.log('No phone number found for lead — skipping lead SMS');
    }

    // 2. SMS alert to Gavin
    await client.messages.create({
      body: `🔥 NEW LEAD — ${firstName} ${lastName}\nPhone: ${phone || 'N/A'}\nEmail: ${email}\nTap to call: ${phone || 'N/A'}`,
      from: process.env.TWILIO_FROM,
      to: process.env.OWNER_PHONE
    });
    console.log(`Alert sent to owner: ${process.env.OWNER_PHONE}`);

  } catch (err) {
    console.error('Error processing lead:', err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} ✅`));
