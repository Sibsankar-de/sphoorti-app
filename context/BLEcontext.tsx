import React, { createContext, useState, useEffect, ReactNode, useContext } from "react";
import { BleManager, Device } from "react-native-ble-plx";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import { Buffer } from "buffer";

// Define the type for the context value
interface BluetoothConnectionContextValue {
  manager: BleManager;
  scannedDevices: Device[];
  isScanning: boolean;
  connectedDevices: Device[];
  startDeviceScanning: () => Promise<void>;
  stopDeviceScanning: () => void;
  connectToDevice: (device: Device) => Promise<void>;
  disconnectDevice: (device: Device) => Promise<void>;
  sendDataToDevice: (device: Device, data: string) => Promise<void>;
}

// Define the type for the provider's props
interface BluetoothConnectionProviderProps {
  children: ReactNode;
}

// Create the context with the correct type
const BluetoothConnectionContext = createContext<BluetoothConnectionContextValue | null>(null);

const bleManager = new BleManager();

export const BluetoothConnectionProvider = ({ children }: BluetoothConnectionProviderProps) => {
  const [manager] = useState(bleManager);
  const [scannedDevices, setScannedDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<Device[]>([]);

  // Cleanup BLE manager on unmount
  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, [manager]);

  // Request necessary permissions for Bluetooth
  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      const permissions = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      if (Platform.Version >= 31) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }
      const granted = await PermissionsAndroid.requestMultiple(permissions);
      return Object.values(granted).every((status) => status === "granted");
    }
    return true; // iOS does not require these permissions
  };

  // Start scanning for BLE devices
  const startDeviceScanning = async () => {
    const permissionsGranted = await requestPermissions();
    if (!permissionsGranted) {
      Alert.alert("Permissions required", "Please grant Bluetooth and location permissions to scan for devices.");
      return;
    }

    setIsScanning(true);
    setScannedDevices([]);

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error("Scan error:", error);
        Alert.alert("Scan error", "Please turn on your device's Bluetooth to continue.");
        setIsScanning(false);
        return;
      }

      if (device && !scannedDevices.find((d) => d.id === device.id)) {
        setScannedDevices((prevDevices) => [...prevDevices, device]);
      }
    });
  };

  // Stop scanning for BLE devices
  const stopDeviceScanning = () => {
    manager.stopDeviceScan();
    setIsScanning(false);
  };

  // Connect to a BLE device
  const connectToDevice = async (device: Device) => {
    try {
      const connectedDevice = await device.connect();
      console.log("Connected to device:", connectedDevice.name);

      // Discover all services and characteristics
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log("Services and characteristics discovered");

      // Log the services and characteristics (for debugging)
      const services = await connectedDevice.services();
      for (const service of services) {
        console.log("Service:", service.uuid);
        const characteristics = await service.characteristics();
        for (const characteristic of characteristics) {
          console.log("Characteristic:", characteristic.uuid);
        }
      }

      setConnectedDevices((prevDevices) => [...prevDevices, connectedDevice]);
    } catch (error) {
      console.error("Connection error:", error);
      Alert.alert("Connection error", "Failed to connect to the device.");
    }
  };

  // Disconnect from a BLE device
  const disconnectDevice = async (device: Device) => {
    try {
      await device.cancelConnection();
      setConnectedDevices((prevDevices) => prevDevices.filter((d) => d.id !== device.id));
      console.log("Disconnected from device:", device.name);
    } catch (error) {
      console.error("Disconnection error:", error);
      Alert.alert("Disconnection error", "Failed to disconnect from the device.");
    }
  };

  // Send data to a connected BLE device
  const sendDataToDevice = async (device: Device, data: string) => {
    try {
      // Convert the data to a base64 encoded string (required by react-native-ble-plx)
      const encodedData = Buffer.from(data).toString("base64");

      // Write the data to the characteristic
      await device.writeCharacteristicWithoutResponseForService(
        "6E400001-B5A3-F393-E0A9-E50E24DCCA9E", // Service UUID
        "6E400002-B5A3-F393-E0A9-E50E24DCCA9E", // Characteristic UUID
        encodedData
      );

      console.log("Data sent successfully:", data);
    } catch (error) {
      console.error("Failed to send data:", error);
      Alert.alert("Error", "Failed to send data to the device.");
    }
  };

  // Create the context value
  const contextValue: BluetoothConnectionContextValue = {
    manager,
    scannedDevices,
    isScanning,
    connectedDevices,
    startDeviceScanning,
    stopDeviceScanning,
    connectToDevice,
    disconnectDevice,
    sendDataToDevice,
  };

  return (
    <BluetoothConnectionContext.Provider value={contextValue}>
      {children}
    </BluetoothConnectionContext.Provider>
  );
};

export const useBluetoothConnection = () => {
  const context = useContext(BluetoothConnectionContext);
  if (!context) {
    throw new Error("useBluetoothConnection must be used within BluetoothConnectionProvider");
  }
  return context;
};

export default BluetoothConnectionContext;