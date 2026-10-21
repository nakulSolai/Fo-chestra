import { Hono } from 'hono';

const fixtureData = {
  comparison: {
    alpha: { name: 'Northstar Collective', price: 148, available: true, detail: 'Group package for eight. Three vegetarian options. Pickup tomorrow at 18:00. Availability requires a direct inquiry.', delay: 1050 },
    beta: { name: 'Fieldwork Kitchen', price: 136, available: true, detail: 'Group package for eight. Four vegetarian options. Pickup tomorrow at 18:15. Reliable backup with online availability.', delay: 1450 },
    gamma: { name: 'Juniper Table', price: 172, available: false, detail: 'Group package for eight. Vegetarian options available. Selected pickup window is unavailable; price exceeds the example budget.', delay: 800 },
  },
  appointments: {
    alpha: { name: 'Studio North', price: 60, available: false, detail: 'Consultation. Tuesday at 10:00 is fully booked. Do not book or submit anything.', delay: 1100 },
    beta: { name: 'Common Ground Studio', price: 45, available: true, detail: 'Consultation. Tuesday at 14:00 is available. Confirmation requires an inquiry.', delay: 1400 },
    gamma: { name: 'Workshop Three', price: 55, available: true, detail: 'Consultation. Wednesday at 11:00 is available. Flexible backup slot.', delay: 850 },
  },
};
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const fixtureRouter = new Hono();
fixtureRouter.get('/:scenario/:candidate', async c => {
  const scenario = c.req.param('scenario') as keyof typeof fixtureData;
  const candidate = c.req.param('candidate') as 'alpha' | 'beta' | 'gamma';
  const data = fixtureData[scenario]?.[candidate];
  if (!data) return c.notFound();
  await new Promise(resolve => setTimeout(resolve, data.delay));
  return c.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${escape(data.name)} · Fixture</title><style>body{margin:0;background:#f5f1e9;color:#24372f;font:18px/1.7 system-ui}main{max-width:760px;margin:60px auto;padding:40px}small{letter-spacing:3px;text-transform:uppercase;color:#657969}h1{font:56px/1.1 Georgia}article{background:white;border:1px solid #d9dfd2;border-radius:20px;padding:30px}strong{font-size:34px}aside{margin-top:28px;color:#68756b}a{color:#426e53}</style></head><body><main><small>Fo-chestra controlled browser fixture</small><h1>${escape(data.name)}</h1><article><p data-price="${data.price}"><strong>$${data.price}</strong> published estimate</p><p data-available="${data.available}">${data.available ? 'Available for inquiry' : 'Selected option unavailable'}</p><p>${escape(data.detail)}</p></article><aside>This is a local demonstration website. The browser really navigates here; its vendor data is fictional. No external communication or payment is possible.</aside><a href="?view=details">View details</a></main></body></html>`);
});
