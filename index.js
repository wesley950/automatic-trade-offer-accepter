const SteamUser = require("steam-user");
const SteamCommunity = require("steamcommunity");
const SteamTotp = require("steam-totp");
const TradeOfferManager = require("steam-tradeoffer-manager");
const FS = require("fs");

const config = require("./config.json");

let atomicCounter = 0;

let client = new SteamUser();
let manager = new TradeOfferManager({
  steam: client,
  domain: config.domainName,
  language: "en",
});
let community = new SteamCommunity();

let logOnOptions = {
  accountName: config.username,
  password: config.password,
  twoFactorCode: SteamTotp.getAuthCode(config.apiKey),
};

if (FS.existsSync("polldata.json")) {
  manager.pollData = JSON.parse(
    FS.readFileSync("polldata.json").toString("utf8")
  );
}

client.logOn(logOnOptions);

client.on("loggedOn", () => {
  console.log("Logged into Steam");

  setInterval(() => {
    if (atomicCounter > 0) {
      console.log('Cannot update cookies because there are trades waiting to be accepted.')
      return
    } else {
      console.log("WARNING: Updating session.");
      client.webLogOn();
    }
  }, 60 * 60 * 1000);
});

client.on("webSession", (sessionID, cookies) => {
  manager.setCookies(cookies, (err) => {
    if (err) {
      console.log(err);
      process.exit(1);
    }

    console.log("Got API key: " + manager.apiKey);
  });

  community.setCookies(cookies);
});

community.on("sessionExpired", (err) => {
  if (err) {
    console.log(`WARNING: Session expired: ${err}`);
  }

  if (client.steamID) {
    client.webLogOn();
    console.log("Re-logging on using client.webLogOn().");
  } else {
    client.logOn(logOnOptions);
    console.log("Re-logging on using client.logOn().");
  }
});

manager.on("newOffer", (offer) => {
  console.log(
    `New offer #${offer.id} from ${offer.partner.getSteam3RenderedID()}`
  );
  let will_accept = offer.itemsToGive.length == 0;
  if (will_accept) {
    setTimeout(() => {
      offer.accept((err, status) => {
        if (err) {
          console.log(err);
        } else {
          console.log("Offer accepted: " + status);
          if (status == "pending") {
            community.acceptConfirmationForObject(
              "identitySecret",
              offer.id,
              (err) => {
                if (err) {
                  console.log("Can't confirm trade offer: " + err.message);
                } else {
                  console.log("Trade offer " + offer.id + " confirmed");
                }
              }
            );
          }
        }
      });
      atomicCounter -= 1
    }, 60000);
    atomicCounter += 1
  }
});

manager.on("receivedOfferChanged", (offer, oldState) => {
  console.log(
    `Offer #${offer.id} changed: ${
      TradeOfferManager.ETradeOfferState[oldState]
    } -> ${TradeOfferManager.ETradeOfferState[offer.state]}`
  );

  if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
    offer.getExchangeDetails(
      (err, status, tradeInitTime, receivedItems, sentItems) => {
        if (err) {
          console.log(`Error ${err}`);
          return;
        }

        let newReceivedItems = receivedItems.map((item) => item.new_assetid);
        console.log(
          `Received items ${newReceivedItems.join(",")} - status ${
            TradeOfferManager.ETradeStatus[status]
          }`
        );
      }
    );
  }
});

manager.on("pollData", (pollData) => {
  FS.writeFileSync("polldata.json", JSON.stringify(pollData));
});
