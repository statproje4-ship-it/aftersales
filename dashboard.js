// =====================
// Helpers
// =====================
async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

function indexBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = item;
    return acc;
  }, {});
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTRY(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY"
  }).format(value);
}

function groupCount(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

function groupSum(items, key, valueKey) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + item[valueKey];
    return acc;
  }, {});
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Utility: safe set text/html only if element exists (prevents crashes on other pages)
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function setHTML(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

// =====================
// SALES DASHBOARD (dashboard.html)
// =====================
async function initDashboard() {
  // If this page doesn't have dashboard elements, don't run
  if (!document.getElementById("totalOrders")) return;

  const orders = await loadJSON("data/orders.json");
  const payments = await loadJSON("data/payments.json");
  const deliveries = await loadJSON("data/deliveries.json");

  // KPIs
  setText("totalOrders", orders.length);

  const revenue = payments.reduce((sum, p) => sum + p.Amount, 0);
  setText("totalRevenue", formatTRY(revenue));

  const delivered = orders.filter(o => o.Status === "Delivered").length;
  setText("deliveredOrders", delivered);

  const inTransit = deliveries.filter(d => d.Status === "In Transit").length;
  setText("inTransit", inTransit);

  // Breakdown lists (only if exist)
  const orderStatusList = document.getElementById("orderStatusList");
  if (orderStatusList) {
    const orderStatusCounts = groupCount(orders, "Status");
    orderStatusList.innerHTML = Object.entries(orderStatusCounts)
      .map(([status, count]) => `<li>${escapeHTML(status)}: <strong>${count}</strong></li>`)
      .join("");
  }

  const paymentMethodList = document.getElementById("paymentMethodList");
  if (paymentMethodList) {
    const paymentSums = groupSum(payments, "PaymentMethod", "Amount");
    paymentMethodList.innerHTML = Object.entries(paymentSums)
      .map(([method, amount]) =>
        `<li>${escapeHTML(method)}: <strong>${formatTRY(amount)}</strong></li>`
      )
      .join("");
  }
}

// Run automatically (safe because it checks for elements)
initDashboard();

// =====================
// ORDERS LIST (orders.html)
// =====================
async function loadOrdersTable() {
  const tbody = document.getElementById("ordersBody");
  if (!tbody) return;

  const [orders, customers] = await Promise.all([
    loadJSON("data/orders.json"),
    loadJSON("data/customers.json")
  ]);

  const customerById = indexBy(customers, "CustomerID");

  tbody.innerHTML = orders.map(o => {
    const c = customerById[o.CustomerID];
    const customerLabel = c
      ? `${escapeHTML(c.CustomerName)} (${escapeHTML(c.City)})`
      : `#${o.CustomerID}`;

    return `
      <tr onclick="location.href='order.html?id=${o.OrderID}'">
        <td>${o.OrderID}</td>
        <td>${customerLabel}</td>
        <td>#${o.StoreID}</td>
        <td>${o.OrderDate}</td>
        <td>${escapeHTML(o.Status)}</td>
        <td class="right">${formatTRY(o.TotalAmount)}</td>
      </tr>
    `;
  }).join("");
}

// =====================
// ORDER DETAIL (order.html)
// =====================
async function loadOrderDetail() {
  // Only run on order.html
  if (!document.getElementById("orderInfo")) return;

  const orderId = Number(getParam("id"));
  if (!orderId) return;

  const [orders, items, payments, deliveries, customers, products] = await Promise.all([
    loadJSON("data/orders.json"),
    loadJSON("data/order_items.json"),
    loadJSON("data/payments.json"),
    loadJSON("data/deliveries.json"),
    loadJSON("data/customers.json"),
    loadJSON("data/products.json")
  ]);

  const customerById = indexBy(customers, "CustomerID");
  const productById = indexBy(products, "ProductID");

  const order = orders.find(o => o.OrderID === orderId);
  if (!order) return;

  const c = customerById[order.CustomerID];
  const customerLabel = c
    ? `${escapeHTML(c.CustomerName)} (${escapeHTML(c.City)})`
    : `#${order.CustomerID}`;

  setHTML("orderInfo", `
    <h3>Order #${order.OrderID}</h3>
    <p>Status: <strong>${escapeHTML(order.Status)}</strong></p>
    <p>Customer: ${customerLabel}</p>
    <p>Total: <strong>${formatTRY(order.TotalAmount)}</strong></p>
  `);

  const orderItems = items.filter(i => i.OrderID === orderId);
  const itemsList = document.getElementById("itemsList");
  if (itemsList) {
    itemsList.innerHTML = orderItems.map(i => {
      const p = productById[i.ProductID];
      const prodLabel = p
        ? `${escapeHTML(p.Brand)} ${escapeHTML(p.Model)} (ID ${i.ProductID})`
        : `Product ${i.ProductID}`;

      return `<li>${prodLabel} — ${i.Quantity} × ${formatTRY(i.UnitPrice)}</li>`;
    }).join("");
  }

  const payment = payments.find(p => p.OrderID === orderId);
  setHTML("paymentInfo", payment
    ? `<h3>Payment</h3><p>${escapeHTML(payment.PaymentMethod)} — ${formatTRY(payment.Amount)}</p>`
    : `<h3>Payment</h3><p class="muted">No payment record</p>`
  );

  const delivery = deliveries.find(d => d.OrderID === orderId);
  setHTML("deliveryInfo", delivery
    ? `<h3>Delivery</h3>
       <p>${escapeHTML(delivery.ShippingCompany)}</p>
       <p>Tracking: ${escapeHTML(delivery.TrackingNumber)}</p>
       <p>Status: ${escapeHTML(delivery.Status)}</p>`
    : `<h3>Delivery</h3><p class="muted">No delivery record</p>`
  );
}

// =====================
// AFTER-SALES DASHBOARD (service-dashboard.html)
// =====================
async function loadServiceDashboard() {
  // Only run on service-dashboard.html
  if (!document.getElementById("totalServices")) return;

  const [services, products] = await Promise.all([
    loadJSON("data/service_requests.json"),
    loadJSON("data/products.json")
  ]);

  const productById = indexBy(products, "ProductID");

  setText("totalServices", services.length);
  setText("openServices", services.filter(s => s.Status === "Open").length);
  setText("progressServices", services.filter(s => s.Status === "In Progress").length);
  setText("closedServices", services.filter(s => s.Status === "Closed").length);

  const byProduct = services.reduce((acc, s) => {
    acc[s.ProductID] = (acc[s.ProductID] || 0) + 1;
    return acc;
  }, {});

  const listEl = document.getElementById("serviceByProduct");
  if (listEl) {
    listEl.innerHTML = Object.entries(byProduct)
      .map(([pid, count]) => {
        const p = productById[Number(pid)];
        const label = p ? `${escapeHTML(p.Brand)} ${escapeHTML(p.Model)} (ID ${pid})` : `Product #${pid}`;
        return `<li>${label}: <strong>${count}</strong> request(s)</li>`;
      })
      .join("");
  }
}

// =====================
// SERVICE REQUESTS LIST (service-requests.html)
// =====================
async function loadServiceRequestsTable() {
  const tbody = document.getElementById("servicesBody");
  if (!tbody) return;

  const [services, customers, products] = await Promise.all([
    loadJSON("data/service_requests.json"),
    loadJSON("data/customers.json"),
    loadJSON("data/products.json")
  ]);

  const customerById = indexBy(customers, "CustomerID");
  const productById = indexBy(products, "ProductID");

  tbody.innerHTML = services.map(s => {
    const c = customerById[s.CustomerID];
    const p = productById[s.ProductID];

    const customerLabel = c ? escapeHTML(c.CustomerName) : `#${s.CustomerID}`;
    const productLabel = p ? `${escapeHTML(p.Brand)} ${escapeHTML(p.Model)}` : `#${s.ProductID}`;

    return `
      <tr onclick="location.href='service.html?id=${s.ServiceID}'">
        <td>${s.ServiceID}</td>
        <td>${customerLabel}</td>
        <td>${productLabel}</td>
        <td>${s.RequestDate}</td>
        <td>${escapeHTML(s.Status)}</td>
      </tr>
    `;
  }).join("");
}

// =====================
// SERVICE DETAIL (service.html)
// =====================
async function loadServiceDetail() {
  // Only run on service.html
  if (!document.getElementById("serviceInfo")) return;

  const id = Number(getParam("id"));
  if (!id) return;

  const [services, customers, products] = await Promise.all([
    loadJSON("data/service_requests.json"),
    loadJSON("data/customers.json"),
    loadJSON("data/products.json")
  ]);

  const customerById = indexBy(customers, "CustomerID");
  const productById = indexBy(products, "ProductID");

  const s = services.find(x => x.ServiceID === id);
  if (!s) return;

  const c = customerById[s.CustomerID];
  const p = productById[s.ProductID];

  const customerLabel = c ? `${escapeHTML(c.CustomerName)} (${escapeHTML(c.City)})` : `#${s.CustomerID}`;
  const productLabel = p
    ? `${escapeHTML(p.Brand)} ${escapeHTML(p.Model)} (Warranty: ${p.WarrantyPeriod} mo)`
    : `#${s.ProductID}`;

  setHTML("serviceInfo", `
    <h3>Service Request #${s.ServiceID}</h3>
    <p>Status: <strong>${escapeHTML(s.Status)}</strong></p>
    <p>Customer: ${customerLabel}</p>
    <p>Product: ${productLabel}</p>
    <p>Date: ${s.RequestDate}</p>
    <h4 style="margin-top:14px;">Issue Description</h4>
    <p>${escapeHTML(s.IssueDescription)}</p>
  `);
}
