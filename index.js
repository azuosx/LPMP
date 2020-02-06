const express = require('express')
const app = express()
const mercadopago = require('mercadopago')
const exphbs = require('express-handlebars')
const contentful = require('contentful')
const bodyParser = require('body-parser')
const axios = require('axios')
const admin = require('firebase-admin')
const uniqid = require('uniqid')

//
// ─── VARIABLES ──────────────────────────────────────────────────────────────────
//

// Server port
const port = 3000
// MercadoPago access token
const MP_access_token = 'TEST-6085268824465174-090622-78c2a96e9c8696cf050f1b475ad1e445-427688830'
// Firebase database URL
const firebaseDbUrl = 'https://teste-checkout-b6649.firebaseio.com'
// Google firebase private key require
const serviceAccount = require('./serviceAccountKey.json')
// Contentful space id
const contentfulSpaceId = '967ioik81s1d'
// Contentful access token
const contentfulAccessToken = 'YH6fiJwH2EIKI-8dBkhAuLg1_2_5KYFgg4x2z_4DL54'

//
// ─── INITIALIZATIONS ────────────────────────────────────────────────────────────
//

mercadopago.configure({ access_token: MP_access_token })

admin.initializeApp({
   credential: admin.credential.cert(serviceAccount),
   databaseURL: firebaseDbUrl
})

const db = admin.firestore()

const client = contentful.createClient({
   space: contentfulSpaceId,
   accessToken: contentfulAccessToken
})

const hbs = exphbs.create({ compilerOptions: { noEscape: true } })

//
// ─── EXPRESS SETS ───────────────────────────────────────────────────────────────
//

app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')
app.use(bodyParser.json())

//
// ─── ROUTES ─────────────────────────────────────────────────────────────────────
//

// Home - where all the products are listed
app.get('/', (req, res) => {
   client
      .getEntries()
      .then(entries => {
         const products = entries.items.map(item => ({ id: item.sys.id, ...item.fields }))
         res.render('home', { products })
      })
      .catch(error => {
         console.log(error)
         res.send('Oops...')
      })
})

// Product page
app.get('/product/:productId', (req, res) => {
   const { productId } = req.params
   const orderId = uniqid()
   client
      .getEntry(productId)
      .then(({ sys, fields: product }) => {
         // Cria um objeto de preferência
         let preference = {
            external_reference: orderId,
            items: [
               {
                  title: product.name,
                  unit_price: 100,
                  quantity: 1
               }
            ]
         }
         mercadopago.preferences
            .create(preference)
            .then(response => {
               res.render('product', { orderId, product, init_point: response.body.sandbox_init_point })
            })
            .catch(err => {
               res.send('Oops...')
            })
      })
      .catch(error => {
         console.log(error)
         res.send('Produto não encontrado...')
      })
})

// Webhook route for MercadoPago to update our internal records
app.post('/finish-payment', (req, res) => {
   const mlPaymentId = req.body.data.id
   res.sendStatus(200)
   axios.get(`https://api.mercadopago.com/v1/payments/${mlPaymentId}?access_token=${MP_access_token}`).then(({ data }) => {
      const { payment_type_id: paymentType, transaction_details, external_reference: orderId, status } = data
      const {external_resource_url: boletoUrl} = transaction_details
      db
      .collection('orders')
      .doc(orderId)
      .update({
         boletoUrl,
         paymentType: paymentType === 'ticket' ? 'boleto' : paymentType,
         status
      })
   })
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
