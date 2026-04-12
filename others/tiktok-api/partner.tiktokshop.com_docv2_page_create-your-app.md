---
url: "https://partner.tiktokshop.com/docv2/page/create-your-app"
title: "TikTok Shop Partner Center"
---

Documentation

Contact Us

Search content

Log in

Join now

# Documents    New

Partner Guide

Developer Guide

API Reference

Webhooks

Terms and Policies

Changelog

FAQs

API Testing Tool![](<Base64-Image-Removed>)

[TikTok Shop developer guide](https://partner.tiktokshop.com/docv2/page/tts-developer-guide)
Get started
[Get started overview](https://partner.tiktokshop.com/docv2/page/tts-developer-types)
Onboarding

Authorization

Make your first API call

Account management
[API entity tags](https://partner.tiktokshop.com/docv2/page/api-entity-tags) [Access scope](https://partner.tiktokshop.com/docv2/page/access-scope)
TikTok Shop API concepts
[Overview](https://partner.tiktokshop.com/docv2/page/tts-api-concepts-overview) [Methods and endpoints](https://partner.tiktokshop.com/docv2/page/methods-and-endpoints) [Common parameters](https://partner.tiktokshop.com/docv2/page/common-parameters) [Sign your API request](https://partner.tiktokshop.com/docv2/page/sign-your-api-request) [Common errors](https://partner.tiktokshop.com/docv2/page/common-errors) [Regions and languages](https://partner.tiktokshop.com/docv2/page/regions-and-languages) [API versioning](https://partner.tiktokshop.com/docv2/page/api-versioning) [Upgrading to API version 202309](https://partner.tiktokshop.com/docv2/page/upgrading-to-api-version-202309) [Upgrade Customer Service API to 202309](https://partner.tiktokshop.com/docv2/page/upgrade-customer-service-api-to-202309)
Developer tools
[Seller Center development shops](https://partner.tiktokshop.com/docv2/page/seller-center-development-shops) [API testing tool](https://partner.tiktokshop.com/docv2/page/api-testing-tool) [Developer dashboard](https://partner.tiktokshop.com/docv2/page/developer-dashboard)
Use case guides

Shops

Product categories

Developing for the TikTok Shop App Store
[App development overview](https://partner.tiktokshop.com/docv2/page/app-development-overview) [Create your App](https://partner.tiktokshop.com/docv2/page/create-your-app) [Edit your App](https://partner.tiktokshop.com/docv2/page/edit-your-app) [Test your App](https://partner.tiktokshop.com/docv2/page/test-your-app)
Launch your App

Reviews

Solution Guidance

TikTok Shop webhooks
[Overview](https://partner.tiktokshop.com/docv2/page/tts-webhooks-overview) [Configuration guide](https://partner.tiktokshop.com/docv2/page/configuration-guide)
TikTok Shop API SDK
[Overview](https://partner.tiktokshop.com/docv2/page/tts-api-sdk-overview) [Download SDK](https://partner.tiktokshop.com/docv2/page/download-sdk) [Integrate Java SDK](https://partner.tiktokshop.com/docv2/page/integrate-java-sdk) [Integrate GoLang SDK](https://partner.tiktokshop.com/docv2/page/integrate-golang-sdk) [Integrate Node.js SDK](https://partner.tiktokshop.com/docv2/page/integrate-node-js-sdk) [Update SDK](https://partner.tiktokshop.com/docv2/page/update-sdk)
TikTok Shop widgets
[Overview](https://partner.tiktokshop.com/docv2/page/tts-widgets-overview) [Get widget token](https://partner.tiktokshop.com/docv2/page/get-widget-token) [Widget SDK user guide](https://partner.tiktokshop.com/docv2/page/widget-sdk-user-guide)
Widget integration guide

Appendix
[Quality engine incident reason code](https://partner.tiktokshop.com/docv2/page/quality-engine-incident-reason-code) [Link to Tokopedia & Shop - ISV & Seller developer onboarding](https://partner.tiktokshop.com/docv2/page/link-to-tokopedia-shop-isv-seller-developer-onboarding) [Link to Tokopedia & Shop - Migration Rehearsal](https://partner.tiktokshop.com/docv2/page/link-to-tokopedia-shop-migration-rehearsal) [How to contact support](https://partner.tiktokshop.com/docv2/page/how-to-contact-support)

# Create your App

Creating an app involves establishing a workspace in Partner Center. Here you obtain your unique API key/secret and set up applicable APIs and configure webhooks to integrate your app with TTS services.

**Important:** You must complete [developer onboarding](https://partner.tiktokshop.com/docv2/page/developer-onboarding) before you can create your app in Partner Center.

# Determine what type of app to build

There are two types of apps you can build with TikTok Shop APIs: public and custom. Each app type has its own workflows and requirements.

- **Public App** \- This type of app is publicly listed on the TikTok Shop App and Service Store and is discoverable by sellers. Sellers will authorize the app to connect their TikTok Shop account. To list this app on TikTok Shop App Store, the app must pass TikTok Shop's app review process.
- **Custom App** \- This type of app is typically developed for a particular seller. It is tailored to meet the specific business needs, requirements, or preferences of a seller. The app is not listed on TikTok Shop App Store. You can distribute this app to individual sellers by sharing the app's authorization link. Custom apps also require TikTok Shop review if they fall under the "Connector" category, or if their authorizations reach 25 or more sellers.

**Note:** Partner Center supports the ability to convert/upgrade a custom app to a public app. Refer to [Publishing a custom app](https://partner.tiktokshop.com/docv2/page/publish-custom-app) for more information on how to convert your published custom app.

## What is the difference between a custom app and a public app?

The following table provides a quick comparison of public and custom app types.

|  | **Public App** | **Custom App** |
| --- | --- | --- |
| **App Visibility** | Sellers can discover public apps on TikTok Shop App Store. Sellers can install and authorize the app to connect to their TikTok Shop accounts. | Sellers can't discover custom apps on the TikTok Shop App Store. Developers must share the authorization link with sellers so they can authorize the app to connect to their TikTok Shop accounts. |
| **App Listing Details** | Required. Information about your app is included in the app listing to help sellers determine whether your app is right for them. | Not required. |
| **App Review Process** | Required. | Required if "Connector" or 25 or more seller authorizations. |

# Create your app

To create your app in Partner Center, complete the following steps:

![Image](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/f5a06afc27134e65bca636b23af254df~tplv-k9wyc2ijk0-image.image)

1. Select **App & Service** from the navigation panel. The Partner Center displays the App & service page.
2. Click the **Create app & service** button in the top right corner of the page. The Partner Center displays the Create app & service page.
3. Select either **Public** or **Custom**, based on the type of app you wish to create.
4. Select the **Service category** and set the **default name** of your app. Optionally, upload a logo for your app.
5. Select the **Market** and set the **seller type** for your app.

**Note:** You must create a separate app/services for each market you intend to serve.

6. If you want to integrate with our API services, toggle the **Enable API** switch on and complete the following fields. Otherwise, skip to the next step.

   - **Redirect URL** \- Enter the URL at which to receive your authorization code. After the [seller authorizes](https://partner.tiktokshop.com/docv2/page/authorization-guide-202309) the app, it will jump to this URL (it can be the URL of your system's web page) and transmit the `auth_code`, which you can use to get the `access_token`.
   - **Webhook URL** \- Optionally, enter the URL to receive [push notifications](https://partner.tiktokshop.com/docv2/page/configuration-guide) (it can be the URL of your system).
7. Click **Create** to complete the process.

After you create your app, Partner Center displays the app and service detail page. Here you can access your app's unique app key and secret, which allow you to complete [seller authorization](https://partner.tiktokshop.com/docv2/page/authorization-guide-202309) and [API calls](https://partner.tiktokshop.com/docv2/page/make-your-first-api-call-overview).

- **App Key** \- The unique identification of the service.
- **App Secret** \- The application key generated by the platform when you create an app. You can use this secret to obtain the API access token.

![](https://p16-arcosite-sg.ibyteimg.com/tos-alisg-i-k9wyc2ijk0-sg/aa7a926d1fea4e4bbf2650487bea9d07~tplv-k9wyc2ijk0-image.image)

# Next Steps

Continue to [Test your App](https://partner.tiktokshop.com/docv2/page/test-your-app) to learn more about how you can test your app with our developer tools.

Is this content helpful?

![](<Base64-Image-Removed>)Helpful![](<Base64-Image-Removed>)Not Helpful

Previous

Next

- [Back To Top](https://partner.tiktokshop.com/docv2/page/create-your-app#Back%20To%20Top)
- [Determine what type of app to build](https://partner.tiktokshop.com/docv2/page/create-your-app#Determine%20what%20type%20of%20app%20to%20build)
- [Create your app](https://partner.tiktokshop.com/docv2/page/create-your-app#Create%20your%20app)
- [Next Steps](https://partner.tiktokshop.com/docv2/page/create-your-app#Next%20Steps)