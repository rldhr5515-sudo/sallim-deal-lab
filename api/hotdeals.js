const categories = [
  ['청소', /물티슈|세제|청소|휴지|키친타월|섬유유연제|탈취|수세미/],
  ['수납', /수납|정리함|리빙박스|옷걸이|행거/],
  ['주방', /프라이팬|후라이팬|냄비|주방|밀폐용기|도마|식기/],
  ['욕실', /욕실|샤워기|발매트|수건/],
  ['반려동물', /배변패드|고양이 모래|강아지|반려동물/],
  ['가전', /청소기|에어프라이어|전자레인지|가습기/]
];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET만 지원합니다.' });
  }

  const affid = process.env.ADPICK_AFFID;
  if (!affid) {
    return res.status(503).json({
      error: '애드픽 회원 아이디가 설정되지 않았습니다.'
    });
  }

  try {
    const url = new URL(
      'https://adpick.co.kr/apis/sdk_shopping_hotdeal.php'
    );
    url.searchParams.set('affid', affid);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw new Error('API 요청 실패');

   const data = await response.json();

const list = Array.isArray(data)
  ? data[0]?.list
  : data.list;

if (!Array.isArray(list)) {
  throw new Error('예상과 다른 데이터 구조');
}

const products = list.flatMap((item) => {

    const products = data.list.flatMap((item) => {
      const name = String(item.product_name || '').trim();
      const category = categories.find(
        ([, pattern]) => pattern.test(name)
      )?.[0];

     onst price = Number(
  String(item.price_sale || '').replace(/,/g, '')
);

const originalPrice = Number(
  String(item.price_org || '').replace(/,/g, '')
);
      const image = String(item.photo || '');
      const buyUrl = String(item.buyurl || '');

      if (!category || !Number.isFinite(price) || price <= 0) {
        return [];
      }

      if (!/^https:\/\//i.test(buyUrl)) return [];

      const discountRate =
        originalPrice > price
          ? Math.round((1 - price / originalPrice) * 100)
          : null;

      return [{
        name,
        category,
        price,
        originalPrice: originalPrice > price ? originalPrice : null,
        discountRate,
        image,
        mall: String(item.mall || ''),
        url: buyUrl
      }];
    });

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=60'
    );

    return res.status(200).json({
      products,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      error: '애드픽 핫딜 상품을 불러오지 못했습니다.'
    });
  }
};
