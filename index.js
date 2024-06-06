const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken'); //jwt
const axios = require('axios'); // bkash
const globals = require('node-global-storage'); //bkash
const { v4: uuidv4 } = require('uuid'); //bkash
require('dotenv').config();  //
const escapeRegExp = require('escape-regexp');
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); //stripe


//middleware
app.use(cors());
app.use(express.json());


//------------------------------------------------------------------

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cq83ksc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();




        const usersCollection = client.db("bytebazaar").collection("users");
        const reviewsCollection = client.db("bytebazaar").collection("reviews");
        const allLaptopsCollection = client.db("bytebazaar").collection("all-laptops");
        const cartCollection = client.db("bytebazaar").collection("cart");
        const favoriteCollection = client.db("bytebazaar").collection("favorites");
        const likesCollection = client.db("bytebazaar").collection("likes");
        const dislikesCollection = client.db("bytebazaar").collection("dislikes");
        const checkoutCollection = client.db("bytebazaar").collection("checkout");
        const paymentCollection = client.db("bytebazaar").collection("payment");



        //-----------------------jwt related api--------------------------------------------------

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token })
        })




        // middlewares 
        const verifyToken = (req, res, next) => {
            //console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }


        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        //---------------------------------------------------------------------------------------------



        // add  users by checking user is in collection or not
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist!', insertedId: null })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);

        })
        //make Admin
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin',
                }

            }
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        //make seller
        app.patch('/users/seller/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'seller',
                }

            }
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        // Get users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        // search user by email query
        app.get('/user', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        //delete user
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })



        // Get home reviews
        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            res.send(result);
        });


        // Get all laptops
        app.get('/alllaptops', async (req, res) => {
            const result = await allLaptopsCollection.find().toArray();
            res.send(result);
        });

        // Get a laptop by id
        app.get('/alllaptops/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await allLaptopsCollection.findOne(query)
            res.send(result)
        })


        //laptop add
        app.post('/alllaptops', async (req, res) => {
            const item = req.body;
            const result = await allLaptopsCollection.insertOne(item);
            res.send(result);
        })

        //laptop edit
        app.patch('/alllaptop/:id', async (req, res) => {
            const data = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    productName: data?.productName,
                    productImage: data?.productImage,
                    productPrice: data?.productPrice,
                    productQuantity: data?.productQuantity
                    ,
                    ...(data?.productGeneral?.productBrand || data?.productGeneral?.productModel || data?.productGeneral?.productLaptopSeries || data?.productGeneral?.productPartNo ?
                        {
                            productGeneral: {
                                ...(data?.productGeneral?.productBrand ? { productBrand: data?.productGeneral?.productBrand } : {}),
                                ...(data?.productGeneral?.productModel ? { productModel: data?.productGeneral?.productModel } : {}),
                                ...(data?.productGeneral?.productLaptopSeries ? { productLaptopSeries: data?.productGeneral?.productLaptopSeries } : {}),
                                ...(data?.productGeneral?.productPartNo ? { productPartNo: data?.productGeneral?.productPartNo } : {})
                            }
                        }
                        : {}),
                    ...(data?.productProcessor?.processorBrand || data?.productProcessor?.processorType || data?.productProcessor?.processorGeneration || data?.productProcessor?.processorModel || data?.productProcessor?.processorCore || data?.productProcessor?.performanceCores || data?.productProcessor?.efficientCores ?
                        {
                            productProcessor: {
                                ...(data?.productProcessor?.processorBrand ? { processorBrand: data?.productProcessor?.processorBrand } : {}),
                                ...(data?.productProcessor?.processorType ? { processorType: data?.productProcessor?.processorType } : {}),
                                ...(data?.productProcessor?.processorGeneration ? { processorGeneration: data?.productProcessor?.processorGeneration } : {}),
                                ...(data?.productProcessor?.processorModel ? { processorModel: data?.productProcessor?.processorModel } : {}),
                                ...(data?.productProcessor?.processorCore ? { processorCore: data?.productProcessor?.processorCore } : {}),
                                ...(data?.productProcessor?.performanceCores ? { performanceCores: data?.productProcessor?.performanceCores } : {}),
                                ...(data?.productProcessor?.efficientCores ? { efficientCores: data?.productProcessor?.efficientCores } : {})
                            }
                        }
                        : {}),
                    ...(data?.productMemory?.ram || data?.productMemory?.installedRAMDetails || data?.productMemory?.ramType || data?.productMemory?.totalRAMSlot || data?.productMemory?.emptyExpansionRAMSlot || data?.productMemory?.maxRAMSupport ?
                        {
                            productMemory: {
                                ...(data?.productMemory?.ram ? { ram: data?.productMemory?.ram } : {}),
                                ...(data?.productMemory?.installedRAMDetails ? { installedRAMDetails: data?.productMemory?.installedRAMDetails } : {}),
                                ...(data?.productMemory?.ramType ? { ramType: data?.productMemory?.ramType } : {}),
                                ...(data?.productMemory?.totalRAMSlot ? { totalRAMSlot: data?.productMemory?.totalRAMSlot } : {}),
                                ...(data?.productMemory?.emptyExpansionRAMSlot ? { emptyExpansionRAMSlot: data?.productMemory?.emptyExpansionRAMSlot } : {}),
                                ...(data?.productMemory?.maxRAMSupport ? { maxRAMSupport: data?.productMemory?.maxRAMSupport } : {})
                            }
                        }
                        : {}),
                    ...(data?.productStorage?.storage || data?.productStorage?.installedHDDType || data?.productStorage?.hddRPM || data?.productStorage?.hddExpansionSlot || data?.productStorage?.installedSSDType || data?.productStorage?.m2ssdExpansionSlot || data?.productStorage?.storageUpgrade ?
                        {
                            productStorage: {
                                ...(data?.productStorage?.storage ? { storage: data?.productStorage?.storage } : {}),
                                ...(data?.productStorage?.installedHDDType ? { installedHDDType: data?.productStorage?.installedHDDType } : {}),
                                ...(data?.productStorage?.hddRPM ? { hddRPM: data?.productStorage?.hddRPM } : {}),
                                ...(data?.productStorage?.hddExpansionSlot ? { hddExpansionSlot: data?.productStorage?.hddExpansionSlot } : {}),
                                ...(data?.productStorage?.installedSSDType ? { installedSSDType: data?.productStorage?.installedSSDType } : {}),
                                ...(data?.productStorage?.m2ssdExpansionSlot ? { m2ssdExpansionSlot: data?.productStorage?.m2ssdExpansionSlot } : {}),
                                ...(data?.productStorage?.storageUpgrade ? { storageUpgrade: data?.productStorage?.storageUpgrade } : {})
                            }
                        }
                        : {}),
                    ...(data?.productGraphics?.graphicsChipset || data?.productGraphics?.graphicsMemoryAccessibility || data?.productGraphics?.graphicsMemory || data?.productGraphics?.graphicsMemoryType ?
                        {
                            productGraphics: {
                                ...(data?.productGraphics?.graphicsChipset ? { graphicsChipset: data?.productGraphics?.graphicsChipset } : {}),
                                ...(data?.productGraphics?.graphicsMemoryAccessibility ? { graphicsMemoryAccessibility: data?.productGraphics?.graphicsMemoryAccessibility } : {}),
                                ...(data?.productGraphics?.graphicsMemory ? { graphicsMemory: data?.productGraphics?.graphicsMemory } : {}),
                                ...(data?.productGraphics?.graphicsMemoryType ? { graphicsMemoryType: data?.productGraphics?.graphicsMemoryType } : {})
                            }
                        }
                        : {}),
                    ...(data?.productDisplay?.displaySizeInch || data?.productDisplay?.displayType || data?.productDisplay?.panelType || data?.productDisplay?.displayResolution || data?.productDisplay?.displaySurface || data?.productDisplay?.touchScreen || data?.productDisplay?.displayRefreshRate || data?.productDisplay?.displayBezel || data?.productDisplay?.brightness || data?.productDisplay?.displayFeatures || data?.productDisplay?.secondaryScreenSize || data?.productDisplay?.secondaryScreenTechnology || data?.productDisplay?.secondaryScreenResolution ?
                        {
                            productDisplay: {
                                ...(data?.productDisplay?.displaySizeInch ? { displaySizeInch: data?.productDisplay?.displaySizeInch } : {}),
                                ...(data?.productDisplay?.displayType ? { displayType: data?.productDisplay?.displayType } : {}),
                                ...(data?.productDisplay?.panelType ? { panelType: data?.productDisplay?.panelType } : {}),
                                ...(data?.productDisplay?.displayResolution ? { displayResolution: data?.productDisplay?.displayResolution } : {}),
                                ...(data?.productDisplay?.displaySurface ? { displaySurface: data?.productDisplay?.displaySurface } : {}),
                                ...(data?.productDisplay?.touchScreen ? { touchScreen: data?.productDisplay?.touchScreen } : {}),
                                ...(data?.productDisplay?.displayRefreshRate ? { displayRefreshRate: data?.productDisplay?.displayRefreshRate } : {}),
                                ...(data?.productDisplay?.displayBezel ? { displayBezel: data?.productDisplay?.displayBezel } : {}),
                                ...(data?.productDisplay?.brightness ? { brightness: data?.productDisplay?.brightness } : {}),
                                ...(data?.productDisplay?.displayFeatures ? { displayFeatures: data?.productDisplay?.displayFeatures } : {}),
                                ...(data?.productDisplay?.secondaryScreenSize ? { secondaryScreenSize: data?.productDisplay?.secondaryScreenSize } : {}),
                                ...(data?.productDisplay?.secondaryScreenTechnology ? { secondaryScreenTechnology: data?.productDisplay?.secondaryScreenTechnology } : {}),
                                ...(data?.productDisplay?.secondaryScreenResolution ? { secondaryScreenResolution: data?.productDisplay?.secondaryScreenResolution } : {})
                            }
                        }
                        : {}),
                    ...(data?.productPortsSlots?.opticalDrive || data?.productPortsSlots?.multimediaCardSlot || data?.productPortsSlots?.supportedMultimediaCard || data?.productPortsSlots?.usb2Port || data?.productPortsSlots?.usb3Port || data?.productPortsSlots?.usbCThunderboltPort || data?.productPortsSlots?.hdmiPort || data?.productPortsSlots?.microHdmiPort || data?.productPortsSlots?.miniHdmiPort || data?.productPortsSlots?.displayPort || data?.productPortsSlots?.miniDPPort || data?.productPortsSlots?.vgaDSub || data?.productPortsSlots?.headphonePort || data?.productPortsSlots?.microphonePort || data?.productPortsSlots?.securityLockSlot ?
                        {
                            productPortsSlots: {
                                ...(data?.productPortsSlots?.opticalDrive ? { opticalDrive: data?.productPortsSlots?.opticalDrive } : {}),
                                ...(data?.productPortsSlots?.multimediaCardSlot ? { multimediaCardSlot: data?.productPortsSlots?.multimediaCardSlot } : {}),
                                ...(data?.productPortsSlots?.supportedMultimediaCard ? { supportedMultimediaCard: data?.productPortsSlots?.supportedMultimediaCard } : {}),
                                ...(data?.productPortsSlots?.usb2Port ? { usb2Port: data?.productPortsSlots?.usb2Port } : {}),
                                ...(data?.productPortsSlots?.usb3Port ? { usb3Port: data?.productPortsSlots?.usb3Port } : {}),
                                ...(data?.productPortsSlots?.usbCThunderboltPort ? { usbCThunderboltPort: data?.productPortsSlots?.usbCThunderboltPort } : {}),
                                ...(data?.productPortsSlots?.hdmiPort ? { hdmiPort: data?.productPortsSlots?.hdmiPort } : {}),
                                ...(data?.productPortsSlots?.microHdmiPort ? { microHdmiPort: data?.productPortsSlots?.microHdmiPort } : {}),
                                ...(data?.productPortsSlots?.miniHdmiPort ? { miniHdmiPort: data?.productPortsSlots?.miniHdmiPort } : {}),
                                ...(data?.productPortsSlots?.displayPort ? { displayPort: data?.productPortsSlots?.displayPort } : {}),
                                ...(data?.productPortsSlots?.miniDPPort ? { miniDPPort: data?.productPortsSlots?.miniDPPort } : {}),
                                ...(data?.productPortsSlots?.vgaDSub ? { vgaDSub: data?.productPortsSlots?.vgaDSub } : {}),
                                ...(data?.productPortsSlots?.headphonePort ? { headphonePort: data?.productPortsSlots?.headphonePort } : {}),
                                ...(data?.productPortsSlots?.microphonePort ? { microphonePort: data?.productPortsSlots?.microphonePort } : {}),
                                ...(data?.productPortsSlots?.securityLockSlot ? { securityLockSlot: data?.productPortsSlots?.securityLockSlot } : {})
                            }
                        }
                        : {}),
                    ...(data?.productNetworkConnectivity?.lan || data?.productNetworkConnectivity?.wiFi || data?.productNetworkConnectivity?.bluetooth ?
                        {
                            productNetworkConnectivity: {
                                ...(data?.productNetworkConnectivity?.lan ? { lan: data?.productNetworkConnectivity?.lan } : {}),
                                ...(data?.productNetworkConnectivity?.wiFi ? { wiFi: data?.productNetworkConnectivity?.wiFi } : {}),
                                ...(data?.productNetworkConnectivity?.bluetooth ? { bluetooth: data?.productNetworkConnectivity?.bluetooth } : {})
                            }
                        }
                        : {}),
                    ...(data?.productAudioCamera?.audioProperties || data?.productAudioCamera?.speaker || data?.productAudioCamera?.microphone || data?.productAudioCamera?.webCam ?
                        {
                            productAudioCamera: {
                                ...(data?.productAudioCamera?.audioProperties ? { audioProperties: data?.productAudioCamera?.audioProperties } : {}),
                                ...(data?.productAudioCamera?.speaker ? { speaker: data?.productAudioCamera?.speaker } : {}),
                                ...(data?.productAudioCamera?.microphone ? { microphone: data?.productAudioCamera?.microphone } : {}),
                                ...(data?.productAudioCamera?.webCam ? { webCam: data?.productAudioCamera?.webCam } : {})
                            }
                        }
                        : {}),
                    ...(data?.productKeyboard?.keyboardLayout || data?.productKeyboard?.keyboardBacklit || data?.productKeyboard?.rgbKeyboard || data?.productKeyboard?.numKeypad || data?.productKeyboard?.pointingDevice ?
                        {
                            productKeyboard: {
                                ...(data?.productKeyboard?.keyboardLayout ? { keyboardLayout: data?.productKeyboard?.keyboardLayout } : {}),
                                ...(data?.productKeyboard?.keyboardBacklit ? { keyboardBacklit: data?.productKeyboard?.keyboardBacklit } : {}),
                                ...(data?.productKeyboard?.rgbKeyboard ? { rgbKeyboard: data?.productKeyboard?.rgbKeyboard } : {}),
                                ...(data?.productKeyboard?.numKeypad ? { numKeypad: data?.productKeyboard?.numKeypad } : {}),
                                ...(data?.productKeyboard?.pointingDevice ? { pointingDevice: data?.productKeyboard?.pointingDevice } : {})
                            }
                        }
                        : {}),
                    ...(data?.productSecurity?.fingerPrintSensor ?
                        {
                            productSecurity: {
                                ...(data?.productSecurity?.fingerPrintSensor ? { fingerPrintSensor: data?.productSecurity?.fingerPrintSensor } : {})
                            }
                        }
                        : {}),
                    ...(data?.productSoftware?.operatingSystem || data?.productSoftware?.licensedApplication ?
                        {
                            productSoftware: {
                                ...(data?.productSoftware?.operatingSystem ? { operatingSystem: data?.productSoftware?.operatingSystem } : {}),
                                ...(data?.productSoftware?.licensedApplication ? { licensedApplication: data?.productSoftware?.licensedApplication } : {})
                            }
                        }
                        : {}),
                    ...(data?.productPhysicalDescription?.color || data?.productPhysicalDescription?.dimensions || data?.productPhysicalDescription?.weightKg || data?.productPhysicalDescription?.packageContent ?
                        {
                            productPhysicalDescription: {
                                ...(data?.productPhysicalDescription?.color ? { color: data?.productPhysicalDescription?.color } : {}),
                                ...(data?.productPhysicalDescription?.dimensions ? { dimensions: data?.productPhysicalDescription?.dimensions } : {}),
                                ...(data?.productPhysicalDescription?.weightKg ? { weightKg: data?.productPhysicalDescription?.weightKg } : {}),
                                ...(data?.productPhysicalDescription?.packageContent ? { packageContent: data?.productPhysicalDescription?.packageContent } : {})
                            }
                        }
                        : {}),
                    ...(data?.productPower?.batteryCapacity || data?.productPower?.batteryType || data?.productPower?.backupTime || data?.productPower?.powerAdapter || data?.productPower?.adapterType ?
                        {
                            productPower: {
                                ...(data?.productPower?.batteryCapacity ? { batteryCapacity: data?.productPower?.batteryCapacity } : {}),
                                ...(data?.productPower?.batteryType ? { batteryType: data?.productPower?.batteryType } : {}),
                                ...(data?.productPower?.backupTime ? { backupTime: data?.productPower?.backupTime } : {}),
                                ...(data?.productPower?.powerAdapter ? { powerAdapter: data?.productPower?.powerAdapter } : {}),
                                ...(data?.productPower?.adapterType ? { adapterType: data?.productPower?.adapterType } : {})
                            }
                        }
                        : {}),
                    ...(data?.productWarranty?.warranty || data?.productWarranty?.warrantyDetails || data?.productWarranty?.warrantyClaimDurationApproximate ?
                        {
                            productWarranty: {
                                ...(data?.productWarranty?.warranty ? { warranty: data?.productWarranty?.warranty } : {}),
                                ...(data?.productWarranty?.warrantyDetails ? { warrantyDetails: data?.productWarranty?.warrantyDetails } : {}),
                                ...(data?.productWarranty?.warrantyClaimDurationApproximate ? { warrantyClaimDurationApproximate: data?.productWarranty?.warrantyClaimDurationApproximate } : {})
                            }
                        }
                        : {}),
                    ...(data?.productAdditionalInfo?.certificationsValue || data?.productAdditionalInfo?.bestForValue || data?.productAdditionalInfo?.specialtyValue || data?.productAdditionalInfo?.othersValue || data?.productAdditionalInfo?.countryOfOriginValue || data?.productAdditionalInfo?.madeInAssembleValue || data?.productAdditionalInfo?.disclaimerValue ?
                        {
                            productAdditionalInfo: {
                                ...(data?.productAdditionalInfo?.certificationsValue ? { certifications: data?.productAdditionalInfo?.certificationsValue } : {}),
                                ...(data?.productAdditionalInfo?.bestForValue ? { bestFor: data?.productAdditionalInfo?.bestForValue } : {}),
                                ...(data?.productAdditionalInfo?.specialtyValue ? { specialty: data?.productAdditionalInfo?.specialtyValue } : {}),
                                ...(data?.productAdditionalInfo?.othersValue ? { others: data?.productAdditionalInfo?.othersValue } : {}),
                                ...(data?.productAdditionalInfo?.countryOfOriginValue ? { countryOfOrigin: data?.productAdditionalInfo?.countryOfOriginValue } : {}),
                                ...(data?.productAdditionalInfo?.madeInAssembleValue ? { madeInAssemble: data?.productAdditionalInfo?.madeInAssembleValue } : {}),
                                ...(data?.productAdditionalInfo?.disclaimerValue ? { disclaimer: data?.productAdditionalInfo?.disclaimerValue } : {})
                            }
                        }
                        : {})
                }
            }
            const result = await allLaptopsCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        //laptop review add by edit
        app.patch('/alllaptops/:id', async (req, res) => {
            const laptop = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    productReviews: laptop.productReviews,

                }
            }
            const result = await allLaptopsCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        //decrease laptop quantity
        app.patch('/descreaselaptops/:id', async (req, res) => {
            const laptop = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    productQuantity: laptop.productQuantity,

                }
            }
            const result = await allLaptopsCollection.updateOne(query, updatedDoc)
            res.send(result)
        })


        //delete laptop
        app.delete('/alllaptops/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await allLaptopsCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/related/:id', async (req, res) => {

            //get id from url
            const id = req.params.id;
            //662e6b18767158e541e77658
            //get product by id
            const query = { _id: new ObjectId(id) };
            const results = await allLaptopsCollection.findOne(query);

            //get product model name
            const productModel = results.productGeneral.productModel.toString();

            try {

                // Split the product model name
                const modelKeywords = productModel.split(' ');



                const filters = modelKeywords.map(keyword => ({
                    'productName': { $regex: escapeRegExp(keyword), $options: 'i' }
                }));

                // Combine filters with AND condition
                const filter = {
                    $and: [
                        { _id: { $ne: new ObjectId(id) } }, // Exclude the specified product ID
                        { $or: filters }
                    ]
                };


                // Fetch 5 filtered data
                const result = await allLaptopsCollection.find(filter).limit(4).toArray();
                res.send(result);
            } catch (err) {
                console.error('Error:', err);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });





        // add to cart 
        app.post('/cart', async (req, res) => {
            const item = req.body;
            const result = await cartCollection.insertOne(item);
            res.send(result);
        })

        // search cart by email query
        app.get('/cart', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        //cart edit
        app.patch('/cart/:id', async (req, res) => {
            const cart = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    quantity: Number(cart.quantity),

                }
            }
            const result = await cartCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        //delete cart
        app.delete('/cart/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })



        // add to favorite 
        app.post('/favorites', async (req, res) => {
            const item = req.body;
            const result = await favoriteCollection.insertOne(item);
            res.send(result);
        })
        // search favorite by email query
        app.get('/favorites', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await favoriteCollection.find(query).toArray();
            res.send(result);
        })
        //delete favorite
        app.delete('/favorites/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await favoriteCollection.deleteOne(query);
            res.send(result);
        })


        // add to like 
        app.post('/likes', async (req, res) => {
            const item = req.body;
            const result = await likesCollection.insertOne(item);
            res.send(result);
        })
        // search like by email query
        app.get('/likes', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await likesCollection.find(query).toArray();
            res.send(result);
        })

        //laptop  add like quantity by edit
        app.patch('/all_laptops/:id', async (req, res) => {
            const laptop = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    productLikes: laptop.productLikes,

                }
            }
            const result = await allLaptopsCollection.updateOne(query, updatedDoc)
            res.send(result)
        })
        //delete like
        app.delete('/likes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await likesCollection.deleteOne(query);
            res.send(result);
        })


        // add to dislike 
        app.post('/dislikes', async (req, res) => {
            const item = req.body;
            const result = await dislikesCollection.insertOne(item);
            res.send(result);
        })
        // search dislike by email query
        app.get('/dislikes', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await dislikesCollection.find(query).toArray();
            res.send(result);
        })
        //laptop  add like quantity by edit
        app.patch('/all_laptop/:id', async (req, res) => {
            const laptop = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    productUnlikes: laptop.productUnlikes,

                }
            }
            const result = await allLaptopsCollection.updateOne(query, updatedDoc)
            res.send(result)
        })
        //delete dislike
        app.delete('/dislikes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await dislikesCollection.deleteOne(query);
            res.send(result);
        })



        // add to checkout 
        app.post('/checkout', async (req, res) => {
            const item = req.body;
            const result = await checkoutCollection.insertOne(item);
            res.send(result);
        })

        // search checkout by email query
        app.get('/checkout', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await checkoutCollection.find(query).toArray();
            res.send(result);
        })

        //delete checkout
        app.delete('/checkout/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await checkoutCollection.deleteOne(query);
            res.send(result);
        })


        //------------ stripe payment---------------------------------------------------------

        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });

        //...............get-post payment history.................

        app.get('/payment/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        // Get all payment
        app.get('/payments', async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        });

        app.post('/payment', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            //  carefully delete each item from the cart after payment
            console.log('payment info', payment);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };

            const deleteResult = await cartCollection.deleteMany(query);

            res.send({ result, deleteResult });
        })

        //payment status edit
        app.patch('/payment/:id', async (req, res) => {
            const payment = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: payment.status,

                }
            }
            const result = await paymentCollection.updateOne(query, updatedDoc)
            res.send(result)
        })

        //delete payment
        app.delete('/payment/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await paymentCollection.deleteOne(query);
            res.send(result);
        })

        //---------------------------------------------------------------------------

        //----------------------bKash payment---------------------------------------------

        let paymentData;

        // Middleware for bKash authentication
        async function bkash_auth(req, res, next) {
            if (globals.get('id_token')) {
                return next();
            }

            try {
                const { data } = await axios.post(process.env.bkash_grant_token_url, {
                    app_key: process.env.bkash_api_key,
                    app_secret: process.env.bkash_secret_key,
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        username: process.env.bkash_username,
                        password: process.env.bkash_password,
                    }
                });

                globals.set('id_token', data.id_token, { protected: true });
                next();
            } catch (error) {
                return res.status(401).json({ error: error.message });
            }
        }

        app.post('/api/bkash/payment/create', bkash_auth, async (req, res) => {
            const { amount, userId, email, name, address, city, number, cartIds, menuItemIds, cartItems, method } = req.body;
            globals.set('userId', userId);

            try {
                const headers = {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    authorization: globals.get('id_token'),
                    'x-app-key': process.env.bkash_api_key,
                };

                const { data } = await axios.post(process.env.bkash_create_payment_url, {
                    mode: '0011',
                    payerReference: " ",
                    callbackURL: 'http://localhost:5000/api/bkash/payment/callback',
                    amount: amount,
                    currency: "BDT",
                    intent: 'sale',
                    merchantInvoiceNumber: 'Inv' + uuidv4().substring(0, 5)
                }, { headers });
                paymentData = { email, name, address, city, number, cartIds, menuItemIds, cartItems, method };

                return res.status(200).json({ bkashURL: data.bkashURL });
            } catch (error) {
                return res.status(401).json({ error: error.message });
            }
        });

        app.get('/api/bkash/payment/callback', bkash_auth, async (req, res) => {
            const { paymentID, status } = req.query;

            if (status === 'cancel' || status === 'failure') {
                return res.redirect(`http://localhost:5173/dashboard/payment`);
            }

            if (status === 'success') {
                try {
                    const headers = {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        authorization: globals.get('id_token'),
                        'x-app-key': process.env.bkash_api_key,
                    };

                    const { data } = await axios.post(process.env.bkash_execute_payment_url, { paymentID }, { headers });
                    // console.log(data)
                    // console.log(paymentData)
                    bKashPayment = {
                        transactionId: data.paymentID,
                        trxID: data.trxID,
                        date: data.paymentExecuteTime,
                        price: parseInt(data.amount),
                        email: paymentData?.email,
                        name: paymentData?.name,
                        address: paymentData?.address,
                        city: paymentData?.city,
                        number: paymentData?.number,
                        cartIds: paymentData?.cartIds,
                        menuItemIds: paymentData?.menuItemIds,
                        cartItems: paymentData?.cartItems,
                        status: 'Accepted',
                        method: paymentData?.method
                    };



                    if (data && data.statusCode === '0000') {

                        //post payment info
                        await paymentCollection.insertOne(bKashPayment);
                        //console.log('payment info', bKashPayment);


                        //carefully delete each item from the cart after payment
                        const query = {
                            _id: {
                                $in: paymentData.cartIds.map(id => new ObjectId(id))
                            }
                        };

                        await cartCollection.deleteMany(query);

                        //decrease product quantity y findning spacific product by id
                        for (let i = 0; i < paymentData?.cartItems?.length; i++) {
                            const querys = { _id: new ObjectId(paymentData?.cartItems[i]?.cartId) }
                            const laptop = await allLaptopsCollection.findOne(querys);
                            //console.log(paymentData?.cartItems[i]?.cartId);
                            // console.log(paymentData?.cartItems[i]?.quantity);

                            const updatedDoc = {
                                $set: {
                                    productQuantity: Number(laptop?.productQuantity) - Number(paymentData?.cartItems[i]?.quantity),

                                }
                            }
                            await allLaptopsCollection.updateOne(querys, updatedDoc)

                        }

                        //delete checkout by finding checkout by email
                        const queries = { email: paymentData?.email }
                        const checkout = await checkoutCollection.find(queries).toArray();
                        const q = { _id: checkout[0]?._id }
                        await checkoutCollection.deleteOne(q);




                        return res.redirect(`http://localhost:5173/dashboard/cart`);
                    } else {
                        return res.redirect(`http://localhost:5173/dashboard/payment`);
                    }
                } catch (error) {
                    console.log(error);
                    return res.redirect(`http://localhost:5173/dashboard/payment`);
                }
            }
        });

        app.get('/api/bkash/payment/refund/:trxID', bkash_auth, async (req, res) => {
            const { trxID } = req.params;

            try {
                const payment = await paymentCollection.findOne({ trxID });

                if (!payment) {
                    return res.status(404).json({ error: 'Payment not found' });
                }

                const headers = {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    authorization: globals.get('id_token'),
                    'x-app-key': process.env.bkash_api_key,
                };

                const { data } = await axios.post(process.env.bkash_refund_transaction_url, {
                    paymentID: payment.paymentID,
                    amount: payment.amount,
                    trxID,
                    sku: 'payment',
                    reason: 'cashback'
                }, { headers });

                if (data && data.statusCode === '0000') {
                    return res.status(200).json({ message: 'refund success' });
                } else {
                    return res.status(404).json({ error: 'refund failed' });
                }
            } catch (error) {
                return res.status(404).json({ error: 'refund failed' });
            }
        });


        //-------------------------------------------------------------------------------



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

//paste here mongodb
//-------------------------------------------------------------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.send('ByteBazaar is sitting')
})


app.listen(port, () => {
    console.log(`ByteBazaar is sitting in port ${port} `)
})


