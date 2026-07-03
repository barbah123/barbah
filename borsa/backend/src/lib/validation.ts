// DOĞRULAMA KATMANI
// Emir borsaya (paper-broker'a) gitmeden önce risk ve tutarlılık kontrolleri.
// Hem manuel emirler hem strateji sinyalleri aynı kontrollerden geçer.

export interface OrderRequest {
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price: number; // güncel piyasa fiyatı
  limitPrice?: number | null;
}

export interface PortfolioState {
  cash: number;
  positionQty: number; // bu semboldeki mevcut adet
  openBuyReserved: number; // açık limit alış emirlerinin rezerve ettiği nakit
  openSellQty: number; // bu sembolde açık satış emirlerindeki adet
}

const MAX_QUANTITY = 100000;

export function validateOrder(
  req: OrderRequest,
  state: PortfolioState
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(req.quantity) || req.quantity <= 0) {
    return { ok: false, error: 'Adet 0’dan büyük olmalı' };
  }
  if (req.quantity > MAX_QUANTITY) {
    return { ok: false, error: `Adet en fazla ${MAX_QUANTITY} olabilir` };
  }
  if (!Number.isFinite(req.price) || req.price <= 0) {
    return { ok: false, error: 'Geçerli bir fiyat alınamadı' };
  }
  if (req.type === 'limit') {
    if (!Number.isFinite(req.limitPrice ?? NaN) || (req.limitPrice as number) <= 0) {
      return { ok: false, error: 'Limit emri için geçerli bir limit fiyatı girin' };
    }
  }

  if (req.side === 'buy') {
    const unitPrice = req.type === 'limit' ? (req.limitPrice as number) : req.price;
    const required = unitPrice * req.quantity;
    const available = state.cash - state.openBuyReserved;
    if (required > available + 1e-9) {
      return {
        ok: false,
        error: `Yetersiz bakiye: gereken $${required.toFixed(2)}, kullanılabilir $${Math.max(0, available).toFixed(2)}`,
      };
    }
  } else {
    const available = state.positionQty - state.openSellQty;
    if (req.quantity > available + 1e-9) {
      return {
        ok: false,
        error: `Yetersiz pozisyon: satılabilir adet ${Math.max(0, available)}`,
      };
    }
  }

  return { ok: true };
}
