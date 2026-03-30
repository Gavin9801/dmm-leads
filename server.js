// Dean & Michael Media — Lead Webhook Server
// Deploy on Railway.app (free) — node server.js
// Required env vars: TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, OWNER_PHONE, META_VERIFY_TOKEN

const express = require('express');
const twilio = require('twilio');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// Meta webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive lead from Meta
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const leadData = changes?.value;
    if (!leadData) return;

    // Fetch lead field data from Meta
    const leadId = leadData.leadgen_id;
    const pageToken = process.env.META_PAGE_TOKEN;
    const metaRes = await fetch(`https://graph.facebook.com/v18.0/${leadId}?access_token=${pageToken}`);
    const lead = await metaRes.json();

    const fields = {};
    (lead.field_data || []).forEach(f => { fields[f.name] = f.values[0]; });

    const firstName = fields['first_name'] || fields['full_name']?.split(' ')[0] || 'There';
    const lastName = fields['last_name'] || fields['full_name']?.split(' ')[1] || '';
    const phone = fields['phone_number'] || fields['phone'] || 'N/A';
    const email = fields['email'] || 'N/A';

    // SMS to lead
    const smsTemplate = process.env.SMS_TEMPLATE || 
      `Hey ${firstName}! Thanks for reaching out to Dean & Michael Media. Gavin will be in touch very shortly! 🙌`;
    
    if (phone !== 'N/A') {
      await client.messages.create({
        body: smsTemplate,
        from: process.env.TWILIO_FROM,
        to: phone
      });
    }

    // SMS to Gavin (owner notification)
    await client.messages.create({
      body: `🔥 NEW LEAD — ${firstName} ${lastName}\nPhone: ${phone}\nEmail: ${email}\nTap to call: ${phone}`,
      from: process.env.TWILIO_FROM,
      to: process.env.OWNER_PHONE
    });

    console.log(`Lead processed: ${firstName} ${lastName}`);
  } catch (err) {
    console.error('Error processing lead:', err);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Server running'));
