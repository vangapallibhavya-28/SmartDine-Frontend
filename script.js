
"use strict";
const API_BASE_URL = "https://smartdine-backend-265f.onrender.com";

let cart = [];
let menuItems = [];
let currentTrackingOrderId = null;
let countdownInterval = null;
let remainingSeconds = 0;

const FALLBACK_IMAGE = "/images/biryani.jpg";

const menuImages = {
    "biryani.jpg": "/images/biryani.jpg",
    "brayani.jpg": "/images/biryani.jpg",
    "pizza.jpg": "/images/pizza.jpg",
    "burger.jpg": "/images/burger.jpg",
    "coffee.jpg": "/images/coffee.jpg",
    "coldcoffee.jpg": "/images/coffee.jpg"
};

const deliveryStatuses = [
    "PLACED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED"
];

// -------------------- INITIALIZATION --------------------

document.addEventListener("DOMContentLoaded", () => {
    loadMenu();

    const orderType = document.getElementById("orderType");

    if (orderType) {
        orderType.addEventListener("change", togglePreOrder);
        togglePreOrder();
    }

    const checkoutForm = document.getElementById("checkoutForm");

    if (checkoutForm) {
        checkoutForm.addEventListener("submit", event => {
            event.preventDefault();
            placeOrder();
        });
    }

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");

    if (orderId) {
        const input = document.getElementById("trackingOrderId");

        if (input) {
            input.value = orderId;
            trackOrder();
        }
    }

    updateCartCount();
    renderCart();
});

// -------------------- API HELPERS --------------------

async function readResponse(response) {
    const text = await response.text();

    if (!text) {
        if (!response.ok) {
            throw new Error(`Request failed (${response.status}).`);
        }
        return {};
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        if (!response.ok) {
            throw new Error(`Request failed (${response.status}).`);
        }

        throw new Error("The server returned an unexpected response.");
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            `Request failed (${response.status}).`
        );
    }

    return data;
}

function getOrderObject(result) {
    return result.order || result.data || result;
}

// -------------------- MESSAGES --------------------

function showMessage(element, text, type) {
    if (!element) {
        alert(text);
        return;
    }

    element.className = `alert alert-${type} mt-3`;
    element.textContent = text;
    element.classList.remove("d-none");
}

function showCheckoutMessage(text, type = "success") {
    const message = document.getElementById("checkoutMessage");

    if (message) {
        showMessage(message, text, type);
    } else {
        alert(text);
    }
}

// -------------------- FOOD IMAGES --------------------
function getFoodImage(filename) {
    if (!filename) {
        return FALLBACK_IMAGE;
    }

    const value = String(filename).trim();

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    const key = value
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        .toLowerCase()
        .trim();

    return menuImages[key] || FALLBACK_IMAGE;
}


function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// -------------------- LOAD MENU --------------------

async function loadMenu() {
    const menuList = document.getElementById("menuList");

    if (!menuList) {
        console.error("HTML element menuList is missing.");
        return;
    }

    menuList.innerHTML =
        '<p class="text-muted">Loading menu...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/menu`)
        const items = await readResponse(response);

        if (!Array.isArray(items)) {
            throw new Error("Menu API did not return a list.");
        }

        menuItems = items;

        if (items.length === 0) {
            menuList.innerHTML = '<p>No menu items available.</p>';
            return;
        }

        menuList.innerHTML = items.map(item => {
            const id = Number(item.id);
            const price = Number(item.price) || 0;
            const image = getFoodImage(item.image);
            const unavailable = item.available === false;

            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card h-100 shadow-sm">
                        <img
                            src="${escapeHtml(image)}"
                            class="card-img-top"
                            alt="${escapeHtml(item.name)}"
                            loading="lazy"
                            style="height:220px; object-fit:cover;"
                            onerror="this.onerror=null;this.src='/images/biryani.jpg'"
                        >

                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title">
                                ${escapeHtml(item.name)}
                            </h5>

                            <p class="text-muted mb-2">
                                ${escapeHtml(item.category || "Food")}
                            </p>

                            <p class="card-text">
                                ${escapeHtml(item.description || "")}
                            </p>

                            <h5 class="text-success">
                                ₹${price.toFixed(2)}
                            </h5>

                            <button
                                type="button"
                                class="btn btn-primary mt-auto"
                                onclick="addToCart(${id})"
                                ${unavailable ? "disabled" : ""}
                            >
                                ${unavailable ? "Unavailable" : "Add to Cart"}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Menu loading error:", error);

        menuList.innerHTML = `
            <div class="alert alert-danger">
                Unable to load menu: ${escapeHtml(error.message)}
                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger ms-2"
                    onclick="loadMenu()"
                >
                    Retry
                </button>
            </div>
        `;
    }
}

// -------------------- CART --------------------

function addToCart(id) {
    const item = menuItems.find(
        food => Number(food.id) === Number(id)
    );

    if (!item) {
        alert("Menu item not found. Refresh the page and try again.");
        return;
    }

    if (item.available === false) {
        alert("This item is currently unavailable.");
        return;
    }

    const existing = cart.find(
        entry => Number(entry.id) === Number(id)
    );

    if (existing) {
        existing.quantity++;
    } else {
        cart.push({
            ...item,
            quantity: 1
        });
    }

    updateCartCount();
    renderCart();

    const message = document.getElementById("checkoutMessage");

    if (message) {
        message.className = "alert alert-success mt-3";
        message.textContent = `${item.name} added to your cart!`;
        message.classList.remove("d-none");
    } else {
        alert(`${item.name} added to your cart!`);
    }
}

function updateCartCount() {
    const element = document.getElementById("cartCount");

    if (!element) {
        return;
    }

    const count = cart.reduce(
        (sum, item) => sum + item.quantity,
        0
    );

    element.textContent = count;
}

function viewCart() {
    renderCart();

    const modalElement = document.getElementById("cartModal");

    if (!modalElement || typeof bootstrap === "undefined") {
        alert("Cart modal or Bootstrap JavaScript is missing.");
        return;
    }

    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function renderCart() {
    const cartItems = document.getElementById("cartItems");

    if (cartItems) {
        if (cart.length === 0) {
            cartItems.innerHTML = `
                <div class="alert alert-warning mb-0">
                    Your cart is empty! Please add items before checkout.
                </div>
            `;
        } else {
            cartItems.innerHTML = cart.map(item => `
                <div class="d-flex justify-content-between align-items-center
                            border-bottom py-3 gap-2">
                    <div>
                        <strong>${escapeHtml(item.name)}</strong>
                        <div>₹${Number(item.price).toFixed(2)} each</div>
                    </div>

                    <div class="d-flex align-items-center gap-2">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            onclick="changeQuantity(${Number(item.id)}, -1)"
                        >−</button>

                        <span>${item.quantity}</span>

                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            onclick="changeQuantity(${Number(item.id)}, 1)"
                        >+</button>
                    </div>

                    <strong>
                        ₹${(
                            Number(item.price) * item.quantity
                        ).toFixed(2)}
                    </strong>
                </div>
            `).join("");
        }
    }

    const subtotal = calculateSubtotal();
    const tax = calculateTax(subtotal);
    const total = subtotal + tax;

    setText("cartSubtotal", subtotal.toFixed(2));
    setText("cartTax", tax.toFixed(2));
    setText("cartTotal", total.toFixed(2));

    updateCartCount();
}

function changeQuantity(id, change) {
    const item = cart.find(
        entry => Number(entry.id) === Number(id)
    );

    if (!item) {
        return;
    }

    item.quantity += change;

    if (item.quantity <= 0) {
        cart = cart.filter(
            entry => Number(entry.id) !== Number(id)
        );
    }

    updateCartCount();
    renderCart();
}

function calculateSubtotal() {
    return cart.reduce(
        (sum, item) =>
            sum + (Number(item.price) || 0) * item.quantity,
        0
    );
}

function calculateTax(subtotal) {
    return subtotal * 0.05;
}

// -------------------- CHECKOUT / PRE-ORDER --------------------

function togglePreOrder() {
    const orderType = document.getElementById("orderType");
    const fields = document.getElementById("preOrderFields");
    const dateInput = document.getElementById("orderDateTime");

    if (!orderType || !fields) {
        return;
    }

    const isPreOrder = orderType.value === "PRE_ORDER";

    fields.classList.toggle("d-none", !isPreOrder);

    if (dateInput) {
        dateInput.required = isPreOrder;

        if (isPreOrder) {
            const minimumTime = new Date(Date.now() + 60000);
            const localMinimum = new Date(
                minimumTime.getTime() -
                minimumTime.getTimezoneOffset() * 60000
            ).toISOString().slice(0, 16);

            dateInput.min = localMinimum;
        } else {
            dateInput.setCustomValidity("");
        }
    }
}

async function placeOrder() {
    if (cart.length === 0) {
        showCheckoutMessage(
            "Your cart is empty! Please add items before checkout.",
            "danger"
        );
        return;
    }

    const message = document.getElementById("checkoutMessage");

    if (message) {
        message.className = "mt-3";
        message.textContent = "";
    }

    const nameInput = document.getElementById("customerName");
    const phoneInput = document.getElementById("customerPhone");
    const orderTypeInput = document.getElementById("orderType");
    const dateInput = document.getElementById("orderDateTime");

    if (!nameInput || !phoneInput || !orderTypeInput) {
        showCheckoutMessage(
            "Checkout fields are missing. Please check index.html.",
            "danger"
        );
        return;
    }

    const customerName = nameInput.value.trim();
    const customerPhone = phoneInput.value.trim();
    const orderType = orderTypeInput.value;

    if (!customerName) {
        showCheckoutMessage("Enter your name.", "danger");
        nameInput.focus();
        return;
    }

    if (!/^\d{10}$/.test(customerPhone)) {
        showCheckoutMessage(
            "Enter a valid 10-digit phone number.",
            "danger"
        );
        phoneInput.focus();
        return;
    }

    let orderDateTime = null;

    if (orderType === "PRE_ORDER") {
        if (!dateInput || !dateInput.value) {
            showCheckoutMessage(
                "Choose a date and time for your pre-order.",
                "danger"
            );
            return;
        }

        const selectedTime = new Date(dateInput.value);

        if (
            Number.isNaN(selectedTime.getTime()) ||
            selectedTime.getTime() <= Date.now()
        ) {
            showCheckoutMessage(
                "Choose a future date and time.",
                "danger"
            );
            return;
        }

        // Keep the customer's selected local date and time.
        orderDateTime = dateInput.value;
    }

    const payload = {
        customerName,
        customerPhone,
        orderType,
        orderDateTime,
        items: cart.map(item => ({
            menuItemId: Number(item.id),
            quantity: Number(item.quantity)
        }))
    };

    const button = document.getElementById("placeOrderBtn");

    if (button) {
        button.disabled = true;
        button.textContent = "Placing Order...";
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await readResponse(response);
        const order = getOrderObject(result);

        if (!order || order.id == null) {
            throw new Error("The server did not return an order ID.");
        }

        const subtotal = calculateSubtotal();
        const tax = calculateTax(subtotal);
        const total = subtotal + tax;

        displayOrderConfirmation({
            order,
            customerName,
            orderType,
            subtotal,
            tax,
            total
        });

        currentTrackingOrderId = String(order.id);

        const trackingInput = document.getElementById("trackingOrderId");

        if (trackingInput) {
            trackingInput.value = currentTrackingOrderId;
        }

        // Empty the cart only after the server confirms the order.
        cart = [];
        updateCartCount();
        renderCart();

        showCheckoutMessage(
            `Order #${order.id} placed successfully!`,
            "success"
        );

    } catch (error) {
        console.error("Order placement error:", error);

        showCheckoutMessage(
            `Order failed: ${error.message}`,
            "danger"
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Confirm Order";
        }
    }
}

function displayOrderConfirmation(details) {
    const {
        order,
        customerName,
        orderType,
        subtotal,
        tax,
        total
    } = details;

    setText("confirmationOrderId", order.id);

    setText(
        "confirmationCustomer",
        order.customerName || customerName
    );

    setText(
        "confirmationType",
        order.orderType ||
        (orderType === "PRE_ORDER" ? "Pre-Order" : "Normal Order")
    );

    setText(
        "confirmationSubtotal",
        numericOrFallback(order.subtotal, subtotal).toFixed(2)
    );

    setText(
        "confirmationTax",
        numericOrFallback(order.tax, tax).toFixed(2)
    );

    setText(
        "confirmationTotal",
        numericOrFallback(order.total, total).toFixed(2)
    );

    const confirmation = document.getElementById("orderConfirmation");

    if (confirmation) {
        confirmation.classList.remove("d-none");

        confirmation.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }
}

function numericOrFallback(value, fallback) {
    if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        Number.isFinite(Number(value))
    ) {
        return Number(value);
    }

    return fallback;
}

// -------------------- ORDER TRACKING --------------------

async function trackOrder() {
    const trackingInput = document.getElementById("trackingOrderId");
    const resultPanel = document.getElementById("trackingResult");
    const errorElement = document.getElementById("trackingError");

    if (!trackingInput || !resultPanel || !errorElement) {
        console.error("Tracking HTML elements are missing.");
        return;
    }

    const id = trackingInput.value.trim();

    errorElement.textContent = "";

    if (!/^[1-9]\d*$/.test(id)) {
        resultPanel.classList.remove("d-none");
        errorElement.textContent = "Enter a valid order ID.";
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/orders/${encodeURIComponent(id)}/tracking`
        );

        const data = await readResponse(response);

        currentTrackingOrderId = id;

        setText("trackedId", data.orderId ?? id);
        setText("trackedCustomer", data.customerName || "Customer");

        const status = data.deliveryStatus || data.status || "PLACED";

        setText("deliveryBadge", formatStatus(status));

        updateTimeline(status);
        updateCourier(status);

        resultPanel.classList.remove("d-none");

        startCountdown(
            Number(data.estimatedDeliveryMinutes ?? 30),
            status,
            data.deliveryStartedAt
        );

    } catch (error) {
        console.error("Tracking error:", error);

        clearInterval(countdownInterval);

        resultPanel.classList.remove("d-none");
        errorElement.textContent = error.message;

        setText("trackedId", "");
        setText("trackedCustomer", "");
        setText("deliveryBadge", "Unavailable");
        setText("eta", "--");
    }
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value ?? "";
    }
}

function formatStatus(status) {
    const labels = {
        PLACED: "Order Placed",
        PREPARING: "Preparing",
        READY: "Food Ready",
        OUT_FOR_DELIVERY: "Out for Delivery",
        DELIVERED: "Delivered"
    };

    return labels[status] || status || "Unknown";
}

function updateTimeline(status) {
    const currentIndex = deliveryStatuses.indexOf(status);

    document.querySelectorAll(".timeline-step").forEach(step => {
        const index = deliveryStatuses.indexOf(step.dataset.status);

        step.classList.toggle(
            "completed",
            currentIndex >= 0 && index <= currentIndex
        );

        step.classList.toggle("active", index === currentIndex);
    });
}

function updateCourier(status) {
    const marker = document.getElementById("courierMarker");
    const message = document.getElementById("courierMessage");

    const positions = {
        PLACED: {
            left: "0%",
            text: "Order received"
        },
        PREPARING: {
            left: "12%",
            text: "Restaurant is preparing your food"
        },
        READY: {
            left: "30%",
            text: "Your food is ready"
        },
        OUT_FOR_DELIVERY: {
            left: "65%",
            text: "Courier is on the way"
        },
        DELIVERED: {
            left: "94%",
            text: "Order delivered!"
        }
    };

    const position = positions[status] || positions.PLACED;

    if (marker) {
        marker.style.left = position.left;
    }

    if (message) {
        message.textContent = position.text;
    }
}

// -------------------- ETA COUNTDOWN --------------------

function startCountdown(minutes, status, startedAt) {
    clearInterval(countdownInterval);

    const etaElement = document.getElementById("eta");

    if (!etaElement) {
        return;
    }

    if (status === "DELIVERED") {
        remainingSeconds = 0;
        etaElement.textContent = "Delivered";
        return;
    }

    const safeMinutes = Number.isFinite(minutes)
        ? Math.max(0, minutes)
        : 30;

    remainingSeconds = Math.floor(safeMinutes * 60);

    if (status === "OUT_FOR_DELIVERY" && startedAt) {
        const startTime = new Date(startedAt).getTime();

        if (Number.isFinite(startTime)) {
            const elapsedSeconds = Math.max(
                0,
                Math.floor((Date.now() - startTime) / 1000)
            );

            remainingSeconds = Math.max(
                0,
                remainingSeconds - elapsedSeconds
            );
        }
    }

    renderCountdown();

    countdownInterval = setInterval(() => {
        if (remainingSeconds > 0) {
            remainingSeconds--;
            renderCountdown();
        } else {
            clearInterval(countdownInterval);
            etaElement.textContent = "Estimated time reached";
        }
    }, 1000);
}

function renderCountdown() {
    const etaElement = document.getElementById("eta");

    if (!etaElement) {
        return;
    }

    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;

    etaElement.textContent =
        `${String(mins).padStart(2, "0")}:` +
        `${String(secs).padStart(2, "0")}`;
}

// -------------------- DEMO DELIVERY STATUS --------------------

async function advanceDeliveryStatus() {
    const input = document.getElementById("trackingOrderId");

    if (!currentTrackingOrderId && input) {
        currentTrackingOrderId = input.value.trim();
    }

    if (!currentTrackingOrderId) {
        alert("Track an order first.");
        return;
    }

    try {
        
const response = await fetch(
    `${API_BASE_URL}/api/orders/${encodeURIComponent(currentTrackingOrderId)}`,
    {
        method: "POST"
    }
);
        
        );

        await readResponse(response);

        if (input) {
            input.value = currentTrackingOrderId;
        }

        await trackOrder();

    } catch (error) {
        console.error("Delivery status update error:", error);

        alert(`Could not update delivery status: ${error.message}`);
    }
}

function trackConfirmedOrder() {
    const id = document.getElementById(
        "confirmationOrderId"
    )?.textContent;

    if (!id) {
        alert("No confirmed order ID was found.");
        return;
    }

    currentTrackingOrderId = id;

    const trackingInput = document.getElementById("trackingOrderId");

    if (trackingInput) {
        trackingInput.value = id;
    }

    const modal = document.getElementById("cartModal");

    if (modal && typeof bootstrap !== "undefined") {
        bootstrap.Modal.getOrCreateInstance(modal).hide();
    }

    const trackingSection = document.getElementById("tracking");

    if (trackingSection) {
        trackingSection.scrollIntoView({
            behavior: "smooth"
        });
    }

    trackOrder();
} 
