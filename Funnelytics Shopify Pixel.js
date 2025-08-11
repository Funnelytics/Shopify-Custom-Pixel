// Add your Workspace ID here by replacing the INSERT_YOUR_WORKSPACE-ID_HERE text
// Ensure that the Workspace ID is enclosed between two double quotes ""
// Here is a quick guide on how to find your Workspace ID in your Funnelytics Dashboard https://hub.funnelytics.io/c/tracking-setup/workspace-id

const funnelyticsProjectID = "INSERT_YOUR_WORKSPACE-ID_HERE";

/*========================================

Do not modify any of the code below

========================================*/

// array of events, that should be called after BOTH of events successfully resolved
const shopifyDeferredEvents = [];

// your funnelytics script self-invoked function
(function (funnel) {
  var deferredEvents = [];
  window.funnelytics = {
    events: {
      trigger: function (name, attributes, callback, opts) {
        deferredEvents.push({
          name: name,
          attributes: attributes,
          callback: callback,
          opts: opts,
        });
      },
    },
  };
  var insert = document.getElementsByTagName("script")[0],
    script = document.createElement("script");
  script.addEventListener("load", function () {
    window.funnelytics.init(funnel, false, deferredEvents, {});
  });
  script.src = "https://cdn.funnelytics.io/track-v3.js";
  script.type = "text/javascript";
  script.async = true;
  insert.parentNode.insertBefore(script, insert);
})(funnelyticsProjectID);

//adaptation of the urltoObject & getSession & getReferrer
function urltoObject(e) {
  var n = {};
  if (e)
    for (var t, s, i = 0; i < (t = e.split("&")).length; i++)
      n[(s = t[i].split("="))[0]] = s[1];
  return n;
}

const retrieveSession = async function (payload) {
  let sessionFromURL = urltoObject(payload.search.substr(1));
  let sessionFromCookie = await browser.cookie.get("_fs");
  if (sessionFromURL._fs) {
    let sessionToUse = sessionFromURL._fs;
    return setShopifyFLCookie(payload, sessionToUse), sessionToUse;
  }
  return sessionFromCookie;
};

const retrieveReferrer = function (payload) {
  let referrerFromURL = urltoObject(payload.search.substr(1));
  let referrerToUse = referrerFromURL._fsRef ? decodeURIComponent(referrerFromURL._fsRef) : decodeURIComponent(payload.referrer);
  return referrerToUse;
};

// adaptation of the getDomain function
const setShopifyFLCookie = function (payload, session) {
  var domainElementsArray = payload.host.split(".");
  if (domainElementsArray.length < 2) {
    return payload.host;
  }

  for (let i = domainElementsArray.length - 2; i >= 0; i--) {
    const currentDomain = domainElementsArray.slice(i).join(".");
    browser.cookie.set(
      `_fs=${session}; path=/; SameSite=None; Secure; expires=Thu, 01 Jan 2038 00:00:00 UTC; domain=${currentDomain}`
    );
  }
};

// adaptation of the init function rewrote with fetch

const funnelyticsDefine = async function (payload) {
  if (!funnelytics.projects.shouldTrackProject()) {
    return;
  }

  if (!funnelytics.client.isBot()) {
    const n = {
      project: funnelyticsProjectID,
      page: payload.page,
      device: window.matchMedia("(pointer:coarse)").matches ? "mobile"
        : "desktop",
      //metadata: getFingerprintingData(),
    };

    if (funnelytics.isSPA === true) {
      n.skipStepCreation = true;
    }

    try {
      const response = await fetch(funnelytics.origin + "/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "d=" + encodeURIComponent(JSON.stringify(n)),
      });

      if (response.ok) {
        const data = await response.json();
        funnelytics.session = data.session;
        setShopifyFLCookie(payload, funnelytics.session);
        recordStep(payload.page, retrieveReferrer(payload), payload);
        funnelytics.projects.addDOMEvents();
      } else if (response.status === 500) {
        funnelytics.cookies.remove(funnelytics.cookie);
      }
    } catch (error) {
      console.error("Error during session creation:", error);
    }
  }
};

//adaptation of the fetchSettings funcion
const retrieveSettings = async function () {
  if (funnelytics.client.isBot()) {
    return;
  }

  // If the settings are already loaded - return them
  if (funnelytics.projects._loaded) {
    var settings = funnelytics.projects._settings;
    return Promise.resolve(settings);
  }

  // If settings are not loaded - fetch them using fetch API
  return await fetch(funnelytics.cfOrigin + "/settings/" + funnelyticsProjectID)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Network response was not ok: " + response.statusText);
      }
      return response.json();
    })
    .then(function (data) {
      funnelytics.projects._settings = data;
      funnelytics.projects._loaded = true;
      return data;
    })
    .catch(function (error) {
      return Promise.reject({
        status: error.status || 500,
        statusText: error.message || "Internal Server Error",
      });
    });
};

//adaptation of the init function
async function funnelyticsStartup(payload) {
  funnelytics.isSPA = payload.isSPA || false;
  funnelytics.project = payload.project;
  funnelytics.session = await retrieveSession(payload);

  if (window.location.href.indexOf("gtm-msr.appspot.com") !== -1) {
    return;
  }

  await retrieveSettings()
    .catch((err) => {
      if (err.status === 403) {
        funnelytics.projects._settings = {
          tracking: false,
        };
      }
    })
    .finally(() => {
      if (funnelytics.projects.shouldTrackProject()) {
        if (funnelytics.session) {
          recordStep(payload.page, retrieveReferrer(payload), payload);
          funnelytics.projects.addDOMEvents();
        } else if (funnelytics.project) {
          funnelyticsDefine(payload);
        }

        if (window.funnelytics_queued) {
          recordStep(payload.page, retrieveReferrer(payload), payload);
        }

        // support for customers with just boolean flag for autotracking
        if (payload.autoTrackingOptions === true) {
          funnelytics.automaticTracking.enable();
        } else if (typeof payload.autoTrackingOptions === "object") {
          funnelytics.automaticTracking.enable(payload.autoTrackingOptions);
        }
      }
    });
}

//adaptation of step with fetch

const recordStep = async function (trackedPageURL, referringURL, payload) {
  if (!funnelytics.projects.shouldTrackProject()) {
    return;
  }

  if (!funnelytics.client.isBot()) {
    if (funnelytics.session) {
      if (funnelytics.isSPA && funnelytics.steps.length > 0) {
        referrer = funnelytics.steps[funnelytics.steps.length - 1];
      }
      funnelytics.steps.push(trackedPageURL);

      const data = {
        project: funnelytics.project,
        session: funnelytics.session,
        page: trackedPageURL,
        referrer: referringURL,
      };

      try {
        const response = await fetch(funnelytics.origin + "/steps", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "d=" + encodeURIComponent(JSON.stringify(data)),
        });

        if (response.ok) {
          const resData = await response.json();
          funnelytics.step = resData.step;
          if (resData.session) {
            funnelytics.session = resData.session;
            funnelytics.cookies.expire(funnelytics.cookie);
            setShopifyFLCookie(payload, funnelytics.session);
          }
        }
      } catch (error) {
        console.error("Error during step recording:", error);
      }
    } else {
      funnelyticsDefine(payload);
    }
  }
};

/*========================================

Page Viewed Subscription

========================================*/

analytics.subscribe("page_viewed", (event) => {
  shopifyDeferredEvents.push({
    callbackFn: funnelyticsStartup,
    payload: {
      project: funnelyticsProjectID,
      isSPA: false,
      deferredEvents: "",
      autoTrackingOptions: {},
      event,
      page: event.context.document.location.href,
      referrer: event.context.document.referrer,
      search: event.context.document.location.search,
      host: event.context.document.location.host,
    },
  });

  shopifyStep();
});

//function to create steps also on non-real pages that fire a pageviewed event like the Thank you page

const shopifyStep = async () => {
  const intervalId = setInterval(async () => {
    if (
      !window.funnelytics ||
      !window.funnelytics.projects ||
      !shopifyDeferredEvents.length
    ) {
      return;
    }

    const { callbackFn, payload } = shopifyDeferredEvents[0];
    clearInterval(intervalId);

    if (funnelytics.step) {
      await recordStep(
        payload.page,
        funnelytics.steps[funnelytics.steps.length - 1],
        payload
      );
    } else {
      await callbackFn(payload);
    }

    shopifyDeferredEvents.shift();
  }, 300);
};

/*========================================

DOM Events Subscriptions

========================================*/

analytics.subscribe("clicked", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    if (!event.data.element.href && !event.data.element.id) {
      return;
    }
    const clickType = event.data.element.href ? "link" : "element";
    const eventInfo = {
      clickType,
      ...event.data.element,
    };
    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("form_submitted", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const element = event.data.element;
    const formAction = element.action;
    const emailRegex = /email/i;
    const [email] = element.elements
      .filter((item) => emailRegex.test(item.id) || emailRegex.test(item.name))
      .map((item) => item.value);
    const formDetails = element.elements.reduce((acc, item) => {
      acc[item.name] = item.value;
      return acc;
    }, {});

    const eventInfo = {
      formId: event.data.element.id,
      formAction,
      ...formDetails,
    };
    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

/*========================================

Standard Events Subscriptions

========================================*/

analytics.subscribe("product_viewed", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const variantInfo = event.data.productVariant;
    const eventInfo = {
      variantId: variantInfo.id,
      variantTitle: variantInfo.untranslatedTitle,
      productTitle: variantInfo.product.untranslatedTitle,
      productId: variantInfo.product.id,
      productType: variantInfo.product.type,
      sku: variantInfo.sku,
      price: variantInfo.price.amount,
      priceCents: Math.round(variantInfo.price.amount * 100),
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("cart_viewed", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};

    const eventInfo = {};

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("collection_viewed", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const collection = event.data.collection;
    const eventInfo = {
      collectionTitle: collection.title,
      titleOfFirstProductInCollection: collection.productVariants[0]?.title,
      priceOfFirstProductInCollection:
        collection.productVariants[0]?.price.amount,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("search_submitted", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const searchResult = event.data.searchResult;
    const eventInfo = {
      searchQuery: searchResult.query,
      firstProductReturnedFromSearch:
        searchResult.productVariants[0]?.product.untranslatedTitle,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("product_added_to_cart", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const cartLineItem = event.data.cartLine;
    const eventInfo = {
      price: cartLineItem.cost.totalAmount.amount,
      priceCents: Math.round(cartLineItem.cost.totalAmount.amount * 100),
      cartlineItemCostCurrency: cartLineItem.cost.totalAmount.currencyCode,
      variantTitle: cartLineItem.merchandise.untranslatedTitle,
      productTitle: cartLineItem.merchandise.product.untranslatedTitle,
      variantId: cartLineItem.merchandise.id,
      productId: cartLineItem.merchandise.product.id,
      productType: cartLineItem.merchandise.product.type,
      sku: cartLineItem.merchandise.sku,
      quantity: cartLineItem.quantity,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("product_removed_from_cart", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const cartLineItem = event.data.cartLine;
    const eventInfo = {
      price: cartLineItem.cost.totalAmount.amount,
      priceCents: Math.round(cartLineItem.cost.totalAmount.amount * 100),
      cartlineItemCostCurrency: cartLineItem.cost.totalAmount.currencyCode,
      variantTitle: cartLineItem.merchandise.untranslatedTitle,
      productTitle: cartLineItem.merchandise.product.untranslatedTitle,
      variantId: cartLineItem.merchandise.id,
      productId: cartLineItem.merchandise.product.id,
      productType: cartLineItem.merchandise.product.type,
      sku: cartLineItem.merchandise.sku,
      quantity: cartLineItem.quantity,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("checkout_started", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const checkout = event.data.checkout;
    const eventInfo = {
      email: checkout.email,
      buyerAcceptsEmailMarketing: checkout.buyerAcceptsEmailMarketing,
      buyerAcceptsSmsMarketing: checkout.buyerAcceptsSmsMarketing,
      currency: checkout.totalPrice.currencyCode,
      checkoutTotal: checkout.totalPrice.amount,
      checkoutSubTotal: checkout.subtotalPrice.amount,
      checkoutItems: checkout.lineItems.length,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("checkout_address_info_submitted", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const checkout = event.data.checkout;
    const eventInfo = {
      email: checkout.email,
      buyerAcceptsEmailMarketing: checkout.buyerAcceptsEmailMarketing,
      buyerAcceptsSmsMarketing: checkout.buyerAcceptsSmsMarketing,
      currency: checkout.totalPrice.currencyCode,
      checkoutTotal: checkout.totalPrice.amount,
      checkoutSubTotal: checkout.subtotalPrice.amount,
      checkoutItems: checkout.lineItems.length,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("checkout_contact_info_submitted", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const checkout = event.data.checkout;
    const eventInfo = {
      email: checkout.email,
      buyerAcceptsEmailMarketing: checkout.buyerAcceptsEmailMarketing,
      buyerAcceptsSmsMarketing: checkout.buyerAcceptsSmsMarketing,
      currency: checkout.totalPrice.currencyCode,
      checkoutTotal: checkout.totalPrice.amount,
      checkoutSubTotal: checkout.subtotalPrice.amount,
      checkoutItems: checkout.lineItems.length,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("checkout_shipping_info_submitted", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const checkout = event.data.checkout;
    const eventInfo = {
      email: checkout.email,
      buyerAcceptsEmailMarketing: checkout.buyerAcceptsEmailMarketing,
      buyerAcceptsSmsMarketing: checkout.buyerAcceptsSmsMarketing,
      currency: checkout.totalPrice.currencyCode,
      checkoutTotal: checkout.totalPrice.amount,
      checkoutSubTotal: checkout.subtotalPrice.amount,
      checkoutItems: checkout.lineItems.length,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("payment_info_submitted", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    const checkout = event.data.checkout;
    const eventInfo = {
      email: checkout.email,
      buyerAcceptsEmailMarketing: checkout.buyerAcceptsEmailMarketing,
      buyerAcceptsSmsMarketing: checkout.buyerAcceptsSmsMarketing,
      currency: checkout.totalPrice.currencyCode,
      checkoutTotal: checkout.totalPrice.amount,
      checkoutSubTotal: checkout.subtotalPrice.amount,
      checkoutItems: checkout.lineItems.length,
    };

    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      eventInfo
    );
    window.funnelytics.events.trigger(event.name, actionAttributes);
  }, 200);
});

analytics.subscribe("checkout_completed", (event) => {
  // Define a single function to wait for funnelytics
  const waitForFunnelytics = (maxWaitTimeMs = 10000, checkIntervalMs = 200) => {
    return new Promise((resolve, reject) => {
      const maxAttempts = maxWaitTimeMs / checkIntervalMs;
      let attempts = 0;

      const checker = window.setInterval(() => {
        if (window.funnelytics && window.funnelytics.step) {
          window.clearInterval(checker);
          resolve(window.funnelytics);
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          window.clearInterval(checker);
          reject(
            new Error(
              `Funnelytics not found after ${maxWaitTimeMs / 1000} seconds`
            )
          );
        }
      }, checkIntervalMs);
    });
  };

  // Safely access nested properties
  const safeGet = (obj, path, defaultValue = null) => {
    return path
      .split(".")
      .reduce(
        (acc, part) =>
          acc && acc[part] !== undefined ? acc[part] : defaultValue,
        obj
      );
  };

  // Process the checkout data after funnelytics is available
  waitForFunnelytics()
    .then((funnelytics) => {
      const checkout = event.data.checkout;
      const checkoutItems = checkout.lineItems || [];

      // Get page information once
      const pageHref = new URL(
        safeGet(funnelytics, "steps", []).length > 0 ? funnelytics.steps[funnelytics.steps.length - 1] : window.location.href
      );

      const pageInfo = {
        domain: pageHref.host,
        pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
      };

      // Get customer and cart data once
      const customer = safeGet(window, "init.data.customer", {});
      const cart = init?.data?.cart;
      const cartData = cart ? {
        cartTotalQuantity: cart?.totalQuantity ?? 0,
        cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
      } : {};

      // Process each line item
      checkoutItems.forEach((item) => {
        // Process discounts once
        const discountInfo = {};
        const itemDiscountAllocations = item.discountAllocations || [];

        if (itemDiscountAllocations.length > 0) {
          itemDiscountAllocations.forEach((discount, index) => {
            // Only add discount info if it exists
            const discountApp = safeGet(
              item,
              `discountAllocations.${index}.discountApplication`
            );
            if (discountApp) {
              discountInfo[`discountCode${index}`] = discountApp.title;
              discountInfo[`discountType${index}`] = discountApp.type;
              discountInfo[`discountAmount${index}`] = safeGet(
                item,
                `discountAllocations.${index}.amount.amount`
              );

            }
          });
        }

        // Calculate item price safely
        const itemPrice = item.finalLinePrice ? item.finalLinePrice.amount : safeGet(item, "variant.price.amount", 0) - safeGet(item, "discountAllocations.0.amount.amount", 0);

        // Build the event info object
        const eventInfo = {
          productTitle: item.title,
          variantTitle: safeGet(item, "variant.title"),
          __order__: safeGet(checkout, "order.id"),
          __total_in_cents__: Math.round(itemPrice * 100),
          variantId: safeGet(item, "variant.id"),
          productId: safeGet(item, "variant.product.id"),
          sellingPlanId: item.sellingPlanAllocation?.sellingPlan.id,
          sellingPlanName: item.sellingPlanAllocation?.sellingPlan.name,
          originalPriceInCents: safeGet(item, "variant.price.amount") ? Math.round(item.variant.price.amount * 100) : null,
          originalPrice: safeGet(item, "variant.price.amount"),
          itemDiscountsAmount: safeGet(
            item,
            "discountAllocations.0.amount.amount",
            0
          ),
          totalDiscountsAmount: safeGet(
            checkout,
            "discountsAmount.amount",
            "N/A"
          ),
          firstOrder: safeGet(checkout, "order.customer.isFirstOrder", "N/A"),
          email: checkout.email,
          buyerAcceptsEmailMarketing:
            checkout.buyerAcceptsEmailMarketing || "N/A",
          buyerAcceptsSmsMarketing: checkout.buyerAcceptsSmsMarketing || "N/A",
          currency: safeGet(checkout, "totalPrice.currencyCode"),
          localeCountry: safeGet(checkout, "localization.country.isoCode"),
          localeMarket: safeGet(checkout, "localization.market.handle"),
          checkoutTotal: safeGet(checkout, "totalPrice.amount"),
          checkoutSubTotal: safeGet(checkout, "subtotalPrice.amount"),
          checkoutItems: (checkout.lineItems || []).length,
        };

        // Trigger the event with combined data
        try {
          window.funnelytics.events.trigger("__commerce_action__", {
            ...pageInfo,
            ...customer,
            ...cartData,
            ...eventInfo,
            ...discountInfo,
          });
        } catch (error) {
          console.error("Failed to trigger funnelytics event:", error);
        }
      });
    })
    .catch((error) => console.error(error.message));
});
/*========================================

Custom Events Subscriptions

========================================*/

analytics.subscribe("customFunnelyticsEvent", (event) => {
  let attempts = 0;
  const maxAttempts = 50;

  const funnelyticsChecker = window.setInterval(function () {
    if (!window.funnelytics || !window.funnelytics.step) {
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(funnelyticsChecker);
        console.log("Funnelytics not found after 10 seconds");
      }
      return;
    }
    window.clearInterval(funnelyticsChecker);

    const pageHref = new URL(funnelytics.steps[funnelytics.steps.length - 1]);
    const pageInfo = {
      domain: pageHref.host,
      pagePath: pageHref.pathname.replace(/\/?(\?|#|$)/, "/$1"),
    };
    const customer = init.data.customer;
    const cart = init?.data?.cart;
    const cartData = cart ? {
      cartTotalQuantity: cart?.totalQuantity ?? 0,
      cartTotalCost: cart?.cost?.totalAmount?.amount ?? "0"
    } : {};
    let actionAttributes = Object.assign(
      {},
      pageInfo,
      customer,
      cartData,
      event.customData.eventAttributes
    );

    window.funnelytics.events.trigger(
      event.customData.eventName,
      actionAttributes
    );
  }, 200);
});
