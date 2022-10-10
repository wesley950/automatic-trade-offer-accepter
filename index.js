const SteamCommunity = require('steamcommunity')
const SteamTotp = require('steam-totp')
const TradeOfferManager = require('steam-tradeoffer-manager')
const FS = require('fs')

const config = require('./config.json')

let community = new SteamCommunity();
let manager = new TradeOfferManager({
  domain: "example.com",
  language: "en",
  pollInterval: 60000
})

let logOnOptions = {
  accountName: config.username,
  password: config.password,
  twoFactorCode: SteamTotp.getAuthCode(config.apiKey)
}

if (FS.existsSync("steamguard.txt"))
{
  logOnOptions.stemguard = FS.readFileSync("steamguard.txt").toString("utf8")
}

if (FS.existsSync("polldata.txt")) {
  manager.pollData = JSON.parse(FS.readFileSync("polldata.json").toString("utf8"))
}

community.login(logOnOptions, (err, sessionID, cookies, steamguard) => {
  if (err) {
    console.log(err)
    process.exit(1)
  }

  console.log(`Got API key: ${manager.apiKey}`)
})

manager.on("newOffer", (offer) => {
  console.log(`New offer #${offer.id} from ${offer.partner.getSteam3RenderedID()}`)
  offer.accept((err, status) => {
    if (err) {
      console.log(`Unable to accept offer: ${err.message}`)
    }
    else {
      console.log(`Offer accepted: ${status}`)
      if (status == "pending") {
        community.acceptConfirmationForObject("identitySecret", offer.id, (err) => {
          if (err) {
            console.log(`Can't confirm trade offer: ${err.message}`)
          }
          else {
            console.log(`Trade offer ${offer.id} confirmed`)
          }
        })
      }
    }
  })
})

manager.on("receivedOfferChanged", (offer, oldState) => {
  console.log(`Offer #${offer.id} changed: ${TradeOfferManager.ETradeOfferState[oldState]} -> ${TradeOfferManager.ETradeOfferState[offer.state]}`)
  if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
    offer.getExchangeDetails((err, status, tradeInitTime, receivedItems, sentItems) => {
      if (err) {
        console.log(`Error: ${err}`)
        return
      }

      let newReceivedItemss = receivedItems.map(item => item.new_assetid)
      console.log(`Received items: ${newReceivedItemss}`)
    })
  }
})

manager.on('pollData', (pollData) => {
  FS.writeFileSync('polldata.json', JSON.stringify(pollData))
})

const renewSession = () => {
  console.log("Warning: Renewing session...")
  community.login(logOnOptions, (err, sessionID, cookies, steamguard) => {
    if (err) {
      console.log(err)
      process.exit(1)
    }
  
    console.log(`Got API key: ${manager.apiKey}`)
  })
}

community.on("sessionExpired", () => {
  renewSession()
})

setTimeout(() => {
  renewSession()
}, 60 * 60 * 1000);
