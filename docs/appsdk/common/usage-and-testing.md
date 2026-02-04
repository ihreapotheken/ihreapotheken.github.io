---
layout: default
title: Usage and Testing
---

# IhreApotheken.de AppSDK Usage and Testing

Mobile app libraries provided with the IhreApotheken.de "AppSDK" software suite are a collection of resources client mobile apps can integrate to implement functionalities such as:

- Pre-built and customizable user interface elements
- Webshop functionalities (e.g., online payment)
- Prescription transfer and other medical-related services

## 1. References

The IhreApotheken.de AppSDK service supports the following platforms:

### 1.1 Android

| Resource | Link |
|----------|------|
| Client Repository | [IA-SDK-Android](https://github.com/ihreapotheken/IA-SDK-Android) |
| Available Versions | [Packages](https://github.com/orgs/ihreapotheken/packages?repo_name=IA-SDK-Android) |

### 1.2 iOS

| Resource | Link |
|----------|------|
| Client Repository | [IA-SDK-iOS](https://github.com/ihreapotheken/IA-SDK-iOS) |
| Available Versions | [Tags](https://github.com/ihreapotheken/IA-SDK-iOS/tags) |

### 1.3 Flutter

| Resource | Link |
|----------|------|
| Client Repository | [IA-SDK-Flutter](https://github.com/ihreapotheken/IA-SDK-Flutter) |
| API Documentation | [Flutter Docs](https://ihreapotheken.github.io/docs/appsdk/flutter) |
| Available Versions | [Tags](https://github.com/ihreapotheken/IA-SDK-Flutter/tags) |

### 1.4 React Native

| Resource | Link |
|----------|------|
| Client Repository | [IA-SDK-React-Native](https://github.com/ihreapotheken/IA-SDK-React-Native) |
| API Documentation | [React Native Docs](https://ihreapotheken.github.io/docs/appsdk/react-native) |
| Available Versions | [Packages](https://github.com/orgs/ihreapotheken/packages?repo_name=IA-SDK-React-Native) |

### 1.5 NativeScript

| Resource | Link |
|----------|------|
| Client Repository | [IA-SDK-NativeScript](https://github.com/ihreapotheken/IA-SDK-NativeScript) |
| API Documentation | [NativeScript Docs](https://ihreapotheken.github.io/docs/appsdk/nativescript) |
| Available Versions | [Packages](https://github.com/orgs/ihreapotheken/packages?repo_name=IA-SDK-NativeScript) |

## 2. Server Environments

Three server environment options are available for IhreApotheken.de AppSDK integration. These environments **do not share data**, so pharmacy or product collections and related services may differ between them.

| Environment | URL | Network Access Required |
|-------------|-----|------------------------|
| Production | https://ihreapotheken.de/ | No |
| Staging | https://qa.ihreapotheken.de/ | Yes |
| Development | https://dev.ihreapotheken.de/ | Yes |

### 2.1 Production

The production-ready environment accessible to end-users.

> **Warning:** Any purchases or data transferred in this environment will be sent to actual pharmacies. **Do not perform testing against production** unless coordinated with the IhreApotheken.de team.

### 2.2 Staging

Server environment for testing changes intended to be merged with production. Use this environment for testing purchases and online payments.

### 2.3 Development

Server environment for development purposes, such as testing changes or evaluating updates. Testing of purchases and online payments can also be performed here.

## 3. Network Access

Staging and development server environments are protected at the network level.

Access for client integrations is granted by whitelisting developer IP addresses (e.g., a client office static IP address). Coordinate access requests directly with the IhreApotheken.de team.

## 4. Test Pharmacies

Pharmacies in the IhreApotheken.de system are identified by integer values.

**Default test pharmacy ID:** `719`

For client integrations, a dedicated pharmacy is generated with configurable service options. These options determine customer-facing features such as:

- Online payment services
- Appointment booking services

Contact the IhreApotheken.de team during onboarding for further details.

## 5. Testing Online Payments

PayPal payments can be tested via the **Staging** or **Development** server environments using the test pharmacy (`719`) or any other pharmacy that supports online payments.

In these environments, PayPal connects to the [sandbox](https://developer.paypal.com/tools/sandbox/) version of the payment service.

**Sandbox Credentials:**

| Field | Value |
|-------|-------|
| Username | `none@personal.example.com` |
| Password | `iaia1234` |

## 6. Demo Apps

The IhreApotheken.de team provides demo apps for all supported platforms, showcasing library functionalities. These example projects are located within the client repositories listed in [Section 1](#1-references).

Demo apps are also distributed via:

- **Firebase App Tester** (Android)
- **TestFlight** (iOS)

Contact the IhreApotheken.de team to request access.

## 7. Access Keys

AppSDK access is protected with keys specific to each client integration and application bundle/package identifier.

**Requirements:**
- Keys are generated per client
- Bundle and package identifier values must be provided to receive access keys
- Keys are used via the public APIs provided by the libraries

> **Important:** Access keys must be kept secure and **should not be added to source control**.

## 8. Runtime Logs

*Documentation pending.*

## 9. Bug Reports

Submit bug reports to the IhreApotheken.de SDK team with the following information:

| Information | Description |
|-------------|-------------|
| Host app info | Name, version, and build number of the integrating app |
| Device info | Make and model of the device |
| Operating system | OS name and version |
| Library version | AppSDK library version number |
| Server environment | Production, Staging, or Development |
| Reproduction steps | Detailed steps to reproduce the issue |
| Visual evidence | Screenshots or videos showcasing the issue |
