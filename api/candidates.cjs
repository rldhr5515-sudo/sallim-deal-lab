const { createHmac, timingSafeEqual } = require('node:crypto');

const endpoint = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/goldbox';
const categories = [
  ['청소', /물티슈|세제|청소|휴지|키친타월|섬유유연제|탈취|수세미/],
  ['수납', /수납|정리함|리빙박스/],
  ['주방', /프라이팬|후라이팬|냄비|주방|밀폐용기|도마/],
  ['욕실', /욕실|샤워기|발매트/],
  ['반려동물', /배변패드|고양이 모래/],
];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST만 지원해요.' });
  }
  const { COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY, SALLIM_ADMIN_TOKEN } = process.env;
  if (!SALLIM_ADMIN_TOKEN || !COUPANG_ACCESS_KEY || !COUPANG_SECRET_KEY)
    return res.status(503).json({ error: 'Vercel에 API 키와 관리 비밀번호를 먼저 설정해 주세요.' });
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + SALLIM_ADMIN_TOKEN);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return res.status(401).json({ error: '관리 비밀번호를 확인해 주세요.' });

  const checkedAt = new Date().toISOString();
  const date = checkedAt.slice(2, 19).replace(/[-:]/g, '') + 'Z';
  const signature = createHmac('sha256', COUPANG_SECRET_KEY).update(date + 'GET' + endpoint).digest('hex');
  try {
    const upstream = await fetch('https://api-gateway.coupang.com' + endpoint, {
      headers: { Authorization: `CEA algorithm=HmacSHA256, access-key=${COUPANG_ACCESS_KEY}, signed-date=${date}, signature=${signature}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error('Upstream HTTP error');
    const result = await upstream.json();
    if (String(result.rCode) !== '0' || !Array.isArray(result.data)) throw new Error('Unexpected response');
    const candidates = [];
    for (const product of result.data) {
      const name = String(product.productName || '').trim();
      const category = categories.find(([, rule]) => rule.test(name))?.[0];
      const price = Number(product.productPrice);
      const url = String(product.productUrl || '');
      if (!category || !Number.isSafeInteger(price) || price <= 0 || !/^https:\/\//i.test(url)) continue;
      candidates.push({ id: String(product.productId || url), name, category, price, url, checkedAt });
    }
    return res.status(200).json({ candidates });
  } catch {
    return res.status(502).json({ error: '쿠팡 후보를 불러오지 못했어요. API 승인 상태나 키를 확인한 후 다시 시도해 주세요.' });
  }
};
