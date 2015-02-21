/**
 * Global member variables for use with rate limits
 */
var cacheAccessLimit = 250;
var lastCacheAccess = 0;

var crestAccessLimit = 1000/30;
var lastCrestAccess = 0;

/**
 * Private helper function that is used to initialize the refresh token
 */
function initializeGetMarketPrice()
{
  var authCode = "LONG_AUTH_CODE";

  // Test Amarr Fuel Block in Dodixie
  var itemId = 20059;
  var regionId = 10000032;
  var stationId = 60011866;
  var orderType = "SELL";

  var price = getMarketPrice(itemId, regionId, stationId, orderType, authCode);
  Logger.log(price);

  itemId = 20059;
  regionId = 10000002;
  stationId = 60003760;

  price = getMarketPrice(itemId, regionId, stationId, orderType, authCode);
  Logger.log(price);
}

/**
 * Returns the market price for a given item.
 *
 * version 1.1
 *
 * @param {itemId} itemId the item ID of the product to look up
 * @param {regionId} regionId the region ID for the market to look up
 * @param {stationId} stationId the station ID for the market to focus on
 * @param {orderType} orderType this should be set to "sell" or "buy" orders
 * @param {authCode} authCode The authorization code provided by EVE SSO
 * @param {refresh} refresh (Optional) Change this value to force Google to refresh return value
 * @customfunction
 */
function getMarketPrice(itemId, regionId, stationId, orderType, authCode, refresh)
{
  try
  {
    var returnPrice = 0;

    // Validate incoming arguments
    if (itemId == null || typeof(itemId) != "number")
    {
      returnPrice = "Invalid Item ID";
    }
    else if (regionId == null || typeof(regionId) != "number")
    {
      returnPrice = "Invalid Region ID";
    }
    else if (stationId == null || typeof(stationId) != "number")
    {
      returnPrice = "Invalid Station ID";
    }
    else if (orderType == null || typeof(orderType) != "string")
    {
      returnPrice = "Invalid order type";
    }
    else
    {
      orderType = orderType.toLowerCase();

      // Setup keys for the cache
      var tokenKey = "authToken";
      var refreshKey = "refreshToken";

      // Make sure that only one script is handling the auth token at a time
      var authLock = "authLock";
      var authLife = 30;
      var tokenLock = getCacheValue(authLock);
      while (tokenLock != null)
      {
        tokenLock = getCacheValue(authLock);
      }
      setCacheValue(authLock, true, authLife);

      // Get the current authorization token from the cache
      var authToken = getCacheValue(tokenKey);

      if (authToken != null)
      {
        // Release the auth token
        removeCacheValue(authLock);

        // Setup variables for the market endpoint we want
        var marketUrl = "https://crest-tq.eveonline.com/market/" + regionId + "/orders/" + orderType + "/";
        var typeUrl = "?type=http://crest-tq.eveonline.com/types/" + itemId + "/";

        var marketHeader = {
          "Authorization" : "Bearer " + authToken
        }

        var marketOptions = {
          "headers" : marketHeader
        }

        // Make the call to get some market data
        var marketResponse = fetchUrl(marketUrl + typeUrl, marketOptions);

        var jsonMarket = JSON.parse(marketResponse);

        returnPrice = getPrice(jsonMarket, stationId, orderType)
      }
      else
      {
        // No authorization token available
        // See if a refresh token exists
        var refreshToken = PropertiesService.getUserProperties().getProperty(refreshKey);

        var isTokenSet = getAuthToken(authCode, tokenKey, refreshToken, refreshKey);

        // Release the auth token
        removeCacheValue(authLock);

        if (isTokenSet)
        {
          returnPrice = getMarketPrice(itemId, regionId, stationId, orderType, authCode, refresh);
        }
        else
        {
          returnPrice = "Auth failed. Check logs.";
        }
      }
    }
  }
  catch (unknownError)
  {
    returnPrice = unknownError.message;
  }

  return returnPrice;
}

/**
 * Custom function that returns an array of prices for a given array
 * of items.
 *
 * @param {itemIdList} itemIdList the list of item IDs of the products to look up
 * @param {regionId} regionId the region ID for the market to look up
 * @param {stationId} stationId the station ID for the market to focus on
 * @param {orderType} orderType this should be set to "sell" or "buy" orders
 * @param {refresh} refresh (Optional) Change this value to force Google to refresh return value
 * @customfunction
 */
function getMarketPriceList(itemIdList, regionId, stationId, orderType, refresh)
{
  var returnValues = [];

  try
  {
    // Only validate arguments within the context of this function
    // Further validation will occur inside getMarketPrice
    if (itemIdList == null || typeof(itemIdList) != "object")
    {
      returnValues = "Invalid Item list";
    }
    else
    {
      for (var itemIndex = 0; itemIndex < itemIdList.length; itemIndex++)
      {
        var itemId = itemIdList[itemIndex];
        if (typeof(itemId) == "object")
        {
          // This needs to be fixed before passing to getMarketPrice() function
          if (itemId.length == 1)
          {
            // This is only a number
            itemId = Number(itemId);
          }
        }
        returnValues[itemIndex] = getMarketPrice(itemId, regionId, stationId, orderType)
      }
    }
  }
  catch (error)
  {
    returnValues = error.message;
  }

  return returnValues;
}

/**
 * Private helper function that requests an authorization token using
 * a give authorization code.
 *
 * version 1.0
 *
 * @param authCode The authorization code provided after logging in through EVE SSO
 * @param tokenKey The key to use for auth token storage in the cache
 * @param refresh_token The refresh token provided by previous token requests. Set to null if none exists.
 * @param refreshKey The key to use for refresh token storage in the cache
 */
function getAuthToken(authCode, tokenKey, refreshToken, refreshKey)
{
  var tokenSet = false;

  var clientId = "YOUR_CLIENT_ID";
  var clientSecret = "YOUR_CLIENT_SECRET";
  var clientEncoded = Utilities.base64Encode(clientId + ":" + clientSecret);

  var tokenUrl = "https://login.eveonline.com/oauth/token/";

  // Setup an options structure to configure the UrlFetchApp for token request
  var headerConfig = {
    "Authorization" : "Basic " + clientEncoded
  };

  var grantType = "authorization_code";
  if (refreshToken != null)
  {
    grantType = "refresh_token";
  }

  var postPayload = {
    "Host" : "https://login.eveonline.com",
    "grant_type" : grantType,
    "code" : authCode,
    "refresh_token" : refreshToken
  };

  var fetchOptions = {
    "method" : "post",
    "headers" : headerConfig,
    "payload" : postPayload
  };

  try
  {
    // Make the call to get a token
    var tokenResponse = fetchUrl(tokenUrl, fetchOptions);

    var jsonToken = JSON.parse(tokenResponse);

    // Cache the access token
    var accessToken = jsonToken['access_token'];
    var tokenLife = jsonToken['expires_in'];
    setCacheValue(tokenKey, accessToken, tokenLife);
    // Store the refresh token for this user
    var newRefreshToken = jsonToken['refresh_token'];
    PropertiesService.getUserProperties().setProperty(refreshKey, newRefreshToken);

    tokenSet = true;
  }
  catch (error)
  {
    throw error;
  }

  return tokenSet;
}

/**
 * Private helper method that will determine the best price for a given item from the
 * market data provided.
 *
 * version 1.1
 *
 * @param {jsonMarket} jsonMarket the market data in JSON format
 * @param {stationId} stationId the station ID to focus the search on
 * @param {orderType} orderType the type of order is either "sell" or "buy"
 */
function getPrice(jsonMarket, stationId, orderType)
{
  var bestPrice = 0;

  // Pull all orders found and start iteration
  var orders = jsonMarket['items'];
  for (var orderIndex = 0; orderIndex < orders.length; orderIndex++)
  {
    var order = orders[orderIndex];
    var location = order['location'];

    if (stationId == location['id'])
    {
      // This is the station market we want
      var price = order['price'];

      if (bestPrice > 0)
      {
        // We have a price from a previous iteration
        if (orderType == "sell" && price < bestPrice)
        {
          bestPrice = price;
        }
        else if (orderType == "buy" && price > bestPrice)
        {
          bestPrice = price;
        }
      }
      else
      {
        // This is the first price found, take it
        bestPrice = price;
      }
    }
  }

  return bestPrice;
}

/**
 * Returns yesterdays market history for a given item.
 *
 * version 1.2
 *
 * @param {itemId} itemId the item ID of the product to look up
 * @param {regionId} regionId the region ID for the market to look up
 * @param {property} property the property you are trying to access; "orderCount", "lowPrice", "highPrice", "avgPrice", "volume"
 * @customfunction
 */
function getMarketHistory(itemId, regionId, property)
{
  var history = 0;
  
  // Validate incoming arguments
  if (itemId == null || typeof(itemId) != "number")
  {
    history = "Invalid Item ID";
  }
  else if (regionId == null || typeof(regionId) != "number")
  {
    history = "Invalid Region ID";
  }
  else if (property != "orderCount" && property != "lowPrice" && property != "highPrice" && property != "avgPrice" && property != "volume")
  {
    history = "Property must be one of: 'orderCount', 'lowPrice', 'highPrice', 'avgPrice', 'volume'";
  }
  else
  { 
    // Setup variables for the market endpoint we want
    var marketUrl = "http://public-crest.eveonline.com/market/" + regionId + "/types/" + itemId + "/history/"
  
    // Make the call to get some market data
    var marketResponse = fetchUrl(marketUrl);
  
    var jsonMarket = JSON.parse(marketResponse);
  
    // Get the desired property
    var items = jsonMarket['items'];
    var history = items[items.length - 1][property]
  }
  return history;
}

/**
 * Private helper method that wraps the UrlFetchApp in a semaphore
 * to prevent service overload.
 *
 * version 1.2
 *
 * @param {url} url The URL to contact
 * @param {options} options The fetch options to utilize in the request
 */
function fetchUrl(url, options)
{
  var semaphore = "lock";
  var semaphoreLife = 2;
  
  var lock = getCacheValue(semaphore);
  while (lock != null)
  {
    lock = getCacheValue(semaphore);
  }
  setCacheValue(semaphore, true, semaphoreLife);

  var httpResponse = null;
  if (options == null)
  {
    httpResponse = UrlFetchApp.fetch(url);
  }
  else
  {
    httpResponse = UrlFetchApp.fetch(url, options);
  }
  
  // Wait based on rate limit
  var requestsPerSecond = 30;
  Utilities.sleep(1000/requestsPerSecond);

  // We're done, so release semaphore
  removeCacheValue(semaphore);

  return httpResponse;
}

/**
 * Private helper method that will return a value from the CacheService
 * based on the key provided. This method prevents service overload.
 */
function getCacheValue(key)
{
  // What time is it?
  var currentTime = new Date().getTime();
  var lastAccess = currentTime - lastCacheAccess;
  if (lastAccess < cacheAccessLimit)
  {
    // We're goin too fast, slow down
    var waitTime = cacheAccessLimit - lastAccess
    Utilities.sleep(waitTime);
    lastCacheAccess = currentTime + waitTime;
  }
  else
  {
    lastCacheAccess = currentTime;
  }

  return CacheService.getUserCache().get(key);
}

/**
 * Private helper method that will set a value into the CacheService
 * using the key provided. This method prevents service overload.
 */
function setCacheValue(key, value, life)
{
  // What time is it?
  var currentTime = new Date().getTime();
  var lastAccess = currentTime - lastCacheAccess;
  if (lastAccess < cacheAccessLimit)
  {
    // We're goin too fast, slow down
    var waitTime = cacheAccessLimit - lastAccess
    Utilities.sleep(waitTime);
    lastCacheAccess = currentTime + waitTime;
  }
  else
  {
    lastCacheAccess = currentTime;
  }

  return CacheService.getUserCache().put(key, value, life);
}

/**
 * Private helper method that will remove a value from the CacheService
 * using the key provided. This method prevents service overload.
 */
function removeCacheValue(key)
{
  // What time is it?
  var currentTime = new Date().getTime();
  var lastAccess = currentTime - lastCacheAccess;
  if (lastAccess < cacheAccessLimit)
  {
    // We're goin too fast, slow down
    var waitTime = cacheAccessLimit - lastAccess
    Utilities.sleep(waitTime);
    lastCacheAccess = currentTime + waitTime;
  }
  else
  {
    lastCacheAccess = currentTime;
  }
  
  return CacheService.getUserCache().remove(key);
}

/**
 * Private helper method that is used to examine function execution
 * in an effort to optimize performance.
 */
function profileGetMarketPrice(itemId, regionId, stationId, orderType, authCode)
{
  var startTime = new Date().getTime();
  var price = getMarketPrice(itemId, regionId, stationId, orderType, authCode);
  var endTime = new Date().getTime();

  if (typeof(price) == 'number')
  {
    return endTime - startTime;
  }
  else
  {
    return price;
  }
}
