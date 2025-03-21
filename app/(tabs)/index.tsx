import React from 'react'
import { Button, ImageBackground, ScrollView, StatusBar, StyleSheet, Text, TouchableHighlight, TouchableNativeFeedback, TouchableOpacity, View } from 'react-native'
import { useEffect, useState } from 'react';

import globalStyle from "../../utils/styles"
import { useBluetoothConnection } from '@/context/BLEcontext';
import { Device } from 'react-native-ble-plx';
import { Link, useNavigation, useRouter } from 'expo-router';


export default function HomeScreen() {
    const {
        scannedDevices,
        isScanning,
        startDeviceScanning,
        stopDeviceScanning,
        connectToDevice } = useBluetoothConnection();

    // scan available devices
    const handleDeviceScan = () => {
        // Start scanning when component mounts
        startDeviceScanning();

        // Stop scanning after 10 seconds
        const scanTimeout = setTimeout(() => {
            stopDeviceScanning();
            console.log("Scanning stopped.");
        }, 10000);

        return () => clearTimeout(scanTimeout);
    }
    useEffect(() => {
        handleDeviceScan();
    }, []);

    // filters devices with the name
    const filter: string = "ESP";
    const [filteredDevices, setFilteredDevices] = useState<Device[]>([]);

    useEffect(() => {
        let f1 = scannedDevices.filter((device: Device) => device.name?.toLowerCase().includes(filter.toLowerCase()))
        setFilteredDevices([...new Map(f1.map((item: Device) => [item.id, item])).values()])
    }, [scannedDevices]);

    return (
        <ImageBackground source={require("../../assets/images/bg-image.png")} style={{ width: "100%", height: "100%" }}>
            <View>
                <View style={styles.container}>
                    <ScrollView>
                        <View>
                            {filteredDevices.length > 0 ?
                                <View>
                                    {filteredDevices.map((device: Device, index) => {
                                        return <DeviceItem key={index} device={device} onPress={(device: Device) => connectToDevice(device)} />
                                    })}
                                </View> :
                                <>
                                    {
                                        isScanning ? <Text style={{ color: "#fff" }}>Scanning for available devices...</Text>
                                            :
                                            <View>
                                                <Text style={[globalStyle.textLarge, globalStyle.textFade]}>No device found</Text>
                                                <Text style={[globalStyle.textMedium, globalStyle.textFade]}>Try to scan for more devices</Text>
                                            </View>
                                    }
                                </>
                            }
                        </View>
                    </ScrollView>
                    <View style={{ position: 'absolute', bottom: 15, alignItems: "center", alignSelf: "center", width: '100%' }}>
                        <TouchableNativeFeedback onPress={() => handleDeviceScan()} disabled={isScanning}>
                            <View style={styles.connectBtn}>
                                <Text style={{ textAlign: 'center', color: "#fff" }} >
                                    {isScanning ? "Scanning devices..." : "Scan Devices"}
                                </Text>
                            </View>
                        </TouchableNativeFeedback>
                    </View>
                </View>
            </View >
        </ImageBackground>
    )
}

interface ItemProps {
    device: Device;
    onPress: (device: Device) => void;
}

const DeviceItem: React.FC<ItemProps> = ({ device, onPress }) => {
    // initialize router
    const router = useRouter();

    // click handler
    const handlePress = () => {
        try {
            onPress(device);
            router.push(`/controlScreen?id=${device.id}`);
        } catch (error) {
            console.log(error);

        }

    }
    return (
        <TouchableNativeFeedback
            background={TouchableNativeFeedback.Ripple("#454545", false)}
            onPress={handlePress}
        >
            <View style={{ padding: 15 }}>
                <Text style={{ color: "#fff" }}>{device.id}</Text>
                <Text style={{ color: "#fff" }}>{device.name || device.localName || device.manufacturerData}</Text>
            </View>
        </TouchableNativeFeedback>
    )
}


const styles = StyleSheet.create({
    container: {
        justifyContent: 'space-between',
        height: '100%',
        width: '100%',
        padding: 10,
        overflowY: "scroll"
    },
    header: {
        color: "#fff",
        fontSize: 20,
        paddingTop: StatusBar.currentHeight,
    },
    connectBtn: {
        backgroundColor: '#c61e1a',
        color: 'white',
        paddingHorizontal: 50,
        paddingVertical: 15,
        width: '100%',
        textAlign: 'center',
        margin: 'auto',
        marginTop: 20,
        borderRadius: 30,
        justifyContent: 'center',
        flexDirection: 'row',
    }
})