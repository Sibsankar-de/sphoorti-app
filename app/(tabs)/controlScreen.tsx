import { Alert, BackHandler, StyleSheet, Text, View, ImageBackground, TextInput, ScrollView } from 'react-native'
import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'expo-router/build/hooks';

import { useBluetoothConnection } from '@/context/BLEcontext'
import { Device, Characteristic } from 'react-native-ble-plx';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { TouchableNativeFeedback } from 'react-native';
import { Audio } from 'expo-av';
import axios from 'axios';
import LottieView from 'lottie-react-native';
import { sleep, isAlphabet, isNumber, isAlphaNumeric } from "../../utils/general-functions"
import data from "../../json/alphabet-map.json"


type DataType = Record<string, string>;

const alphaData: DataType = data;

export default function ControlScreen() {
    const { scannedDevices, connectToDevice, manager, connectedDevices, sendDataToDevice, disconnectDevice } = useBluetoothConnection();
    // get device id from query params
    const queries = useSearchParams();
    const deviceId = queries.get('id');
    const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
    useEffect(() => {
        if (scannedDevices.length > 0) {
            const device = scannedDevices.find((device: Device) => device.id === deviceId);
            setCurrentDevice(device || null);
        }
    }, [deviceId, scannedDevices]);


    // reconnect to the device
    const [reconnect, setReconnect] = useState(false);
    const handleReconnect = () => {
        if (currentDevice) {
            setReconnect(true);
            connectToDevice(currentDevice);
            console.log("connectedDevices", connectedDevices);

        }
        setReconnect(false);
    }

    // recording functionality
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [transcription, setTranscription] = useState<string>('');
    const [textInput, setTextInput] = useState<string>("");
    const [uploading, setUploading] = useState<boolean>(false);
    const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);


    useEffect(() => {
        requestPermissions();
    }, []);

    async function requestPermissions() {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission Denied", "You need to allow microphone access.");
        }
    }

    async function startRecording() {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== "granted") {
                Alert.alert("Permission Denied");
                return;
            }

            setIsRecording(true);
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(recording);
            console.log('Audio recording started');

            // Automatically stop recording after 10 seconds
            const id = setTimeout(() => {
                stopRecording();
            }, 10000); // 10 seconds
            setTimeoutId(id);
        } catch (error) {
            console.error("Failed to start recording:", error);
            setIsRecording(false);
        }
    }

    async function stopRecording() {
        if (!recording) return;

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        setIsRecording(false);

        if (timeoutId) {
            clearTimeout(timeoutId);
            setTimeoutId(null);
        }

        if (uri) {
            await uploadToCloudinary(uri);
        } else {
            console.error('Failed to get recording URI');
        }

    }

    // Upload audio to Cloudinary
    const uploadToCloudinary = async (uri: string) => {
        if (!uri) {
            Alert.alert('No Audio File', 'Please record an audio file first.');
            return;
        }

        setUploading(true);

        const cloudName = 'denjnvjas';
        const apiKey = '246158419833942';
        const uploadPreset = 'expo-audio';
        const folder = 'sphoorti-transcriptions';

        const formData = new FormData();
        formData.append('file', {
            uri: uri,
            name: 'recording.mp3',
            type: 'audio/mp3',
        } as any);
        formData.append('upload_preset', uploadPreset);
        formData.append('cloud_name', cloudName);
        formData.append('api_key', apiKey);
        formData.append("folder", folder)

        try {
            const response = await axios.post(
                `https://api.cloudinary.com/v1_1/${cloudName}/upload`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            console.log('Upload Successful!', `File URL: ${response.data.secure_url}`);
            // transcripts audio
            let transcript = await transcribeAudio(response.data.secure_url) || "";
            transcript = transcript.replace(/[^\w\s]/g, " "); // removes symbols from transcription
            setTranscription(transcript);
            setTextInput(transcript)
            setUploading(false);

            if (currentDevice)
                handleSending(transcript, currentDevice);


        } catch (error) {
            console.error('Upload error:', error);
            Alert.alert('Upload Failed', 'An error occurred while uploading the file.');
        } finally {
            setUploading(false);
        }

        setUploading(false);
    };

    // transcript audio
    const transcribeAudio = async (audioUrl: string): Promise<string | null> => {
        const assemblyAiApiKey = 'd9c2eea24b1f4c279cab7f3989660795'; // Replace with your AssemblyAI API key

        try {
            // Step 1: Submit the audio URL to AssemblyAI for transcription
            const submissionResponse = await axios.post(
                'https://api.assemblyai.com/v2/transcript',
                {
                    audio_url: audioUrl,
                },
                {
                    headers: {
                        authorization: assemblyAiApiKey,
                        'content-type': 'application/json',
                    },
                }
            );

            const transcriptId = submissionResponse.data.id;
            console.log('Transcript ID:', transcriptId);

            // Step 2: Poll AssemblyAI for the transcription result
            let transcriptionResult;
            while (true) {
                const statusResponse = await axios.get(
                    `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                    {
                        headers: {
                            authorization: assemblyAiApiKey,
                        },
                    }
                );

                transcriptionResult = statusResponse.data;
                if (transcriptionResult.status === 'completed' || transcriptionResult.status === 'error') {
                    break;
                }

                // Wait for 2 seconds before polling again
                await sleep(2000)
            }

            if (transcriptionResult.status === 'completed') {
                console.log('Transcription result:', transcriptionResult.text);
                return transcriptionResult.text; // Return the transcription text
            } else {
                console.error('Transcription error:', transcriptionResult);
                Alert.alert('Transcription Failed', 'An error occurred while transcribing the audio.');
                throw new Error('Transcription failed');
            }
        } catch (error) {
            console.error('Transcription error:', error);
            Alert.alert('Transcription Failed', 'An error occurred while transcribing the audio.');
            throw error;
        }
    };

    // button handles
    const handleRecordButton = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }

    // handle text input
    const handleTextSend = async () => {
        if (textInput.length > 0 && currentDevice) {
            try {
                await handleSending(textInput, currentDevice);
            } catch (error) {

            }
        }

    }

    // convert audio into codes
    const [isSending, setIsSending] = useState(false);
    const [stopSending, setStopSending] = useState(false);
    const sendingRef = useRef(stopSending);
    // set sending status for sending data
    const [sendingStatus, setSendingStatus] = useState({ completed: "", remaining: "" });
    useEffect(() => {
        setSendingStatus({ completed: "", remaining: transcription || textInput })
    }, [transcription, textInput])


    const timePeriod = useRef(5000);
    // send audio to esp
    const handleSending = async (script: string, device: Device) => {
        setIsSending(true);
        script = script + "#";
        try {
            setIsSending(true);
            for (let i = 0; i < script.length; i++) {
                if (isAlphaNumeric(script[i])) {
                    if (script[i] && isAlphabet(script[i])) {
                        await sendDataToDevice(device, alphaData[script[i].toUpperCase()])

                    }
                    else if (script[i] && isNumber(script[i])) {
                        if (i != 0 && isNumber(script[i - 1])) {
                            await sendDataToDevice(device, script[i]);
                        } else {
                            await sendDataToDevice(device, "001111")
                            await sleep(timePeriod.current);
                            await sendDataToDevice(device, alphaData[script[i]])
                        }
                    }
                    setSendingStatus({ completed: script.slice(0, i), remaining: script.slice(i, script.length - 1) });
                    await sleep(timePeriod.current);
                }
                else if (script[i] === "#") {
                    // handle end of sending
                    await sendDataToDevice(device, "#");
                    setIsSending(false);
                } else {
                    setSendingStatus({ completed: script.slice(0, i), remaining: script.slice(i, script.length - 1) });
                }

                // handle stop sending
                if (sendingRef.current == true) {
                    await sendDataToDevice(device, "#");
                    setStopSending(false);
                    sendingRef.current = false;
                    setIsSending(false);
                    return;
                };
            }
        } catch (error) {
            console.log("Error sending data: ", error);
            setIsSending(false);
            return;
        }

    }

    const handleStopSending = () => {
        setStopSending(true);
        sendingRef.current = true
    }

    const [updatePeriod, setUpdatePeriod] = useState(timePeriod.current);

    const handleSendSpeed = (increment = 0) => {
        if (updatePeriod + increment >= 3000) setUpdatePeriod(updatePeriod + increment);
    }

    useEffect(() => {
        timePeriod.current = updatePeriod;
    }, [updatePeriod])


    return (
        <ImageBackground source={require("../../assets/images/bg-image.png")} style={{ width: "100%", height: "100%" }}>
            <View style={styles.container}>
                <View style={styles.detailsBox}>
                    <Text style={{ color: "#fff", marginBottom: 5, fontSize: 20 }}>{currentDevice?.name || currentDevice?.localName || currentDevice?.manufacturerData}</Text>
                    <Text style={{ color: "#fff" }}>{currentDevice?.id}</Text>
                </View>
                <View>
                    <ScrollView>
                        <View style={styles.contentBox}>
                            <View style={{ alignItems: 'center' }}>
                                <TouchableNativeFeedback onPress={handleRecordButton} disabled={uploading || isSending}>
                                    <View style={styles.micButton}>
                                        <Icon name="microphone-alt" size={100} color="#11a5f6" />
                                        {isRecording &&
                                            <LottieView source={require("../../assets/lottie/voice-loader.json")} autoPlay loop style={{ width: 100, height: 100, position: "absolute" }} />
                                        }
                                        {uploading && <View style={{ position: 'absolute', alignItems: "center" }} >
                                            <LottieView source={require("../../assets/lottie/upload-loader.json")} autoPlay loop style={{ width: 100, height: 100 }} />
                                            <Text style={{ color: "#fff", fontSize: 17 }}>Transcripting...</Text>
                                        </View>}
                                        {isSending &&
                                            <LottieView source={require("../../assets/lottie/send-loader.json")} duration={4000} autoPlay loop style={{ position: 'absolute', width: 160, height: 160 }} />}
                                    </View>
                                </TouchableNativeFeedback>
                                <View style={{ marginTop: 10 }}>
                                    {isRecording && <Text style={{ color: "#d4d4c9", marginBottom: 5 }}>Audio recording...</Text>}
                                    {(!uploading && !isSending) && <Text style={{ color: "#d4d4c9" }}>Tap to {isRecording ? "stop recording" : "record audio"}</Text>}
                                </View>
                            </View>
                            {<View style={styles.transCriptionBox}>
                                <View style={{ marginBottom: 5, flexDirection: "row", alignItems: "center", gap: 10 }}>
                                    <Text style={{ color: "#fff", fontSize: 18 }}>{uploading ? "Transcripting..." : "Transcription"}</Text>
                                    {isSending && <Text style={{ fontSize: 11, color: "rgb(140, 220, 254)" }}>Sending data...</Text>}
                                </View>
                                <View style={{ marginBottom: 15, flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                                    {(isSending) ? <>
                                        <Text style={{ color: "#d4d4c9", fontSize: 16 }}>{sendingStatus.completed}</Text>
                                        <Text style={{ color: "#878787", fontSize: 16 }}>{sendingStatus.remaining}</Text>
                                    </> :
                                        <View style={{ width: "100%", flexDirection: "row", gap: 5, }}>
                                            <TextInput style={styles.textInput} placeholder='Enter your text or record audio 🤗' onChangeText={e => setTextInput(e)} value={textInput} placeholderTextColor={"#d4d4c9"} />
                                            <View>
                                                <TouchableNativeFeedback onPress={handleTextSend}>
                                                    <View style={styles.sendBtn}>
                                                        <Icon name="arrow-up" size={15} color="#fff" />
                                                    </View>
                                                </TouchableNativeFeedback>
                                            </View>
                                        </View>
                                    }
                                </View>

                                {isSending && <Text style={{ color: "#d4d4c9", marginBottom: 10 }}>Time period - {updatePeriod / 1000}s</Text>}
                                {isSending &&
                                    <View style={{ flexDirection: "row", gap: 10 }}>
                                        <View style={{ flex: 1 }}>
                                            <TouchableNativeFeedback onPress={() => handleSendSpeed(1000)} >
                                                <View style={styles.stopBtn}>
                                                    <Icon name="plus" size={20} color="#d4d4c9" />
                                                </View>
                                            </TouchableNativeFeedback>
                                        </View>

                                        <View style={{ flex: 3 }}>
                                            <TouchableNativeFeedback onPress={handleStopSending} >
                                                <View style={{ ...styles.stopBtn, width: "100%" }}>
                                                    <Text style={{ color: "#d4d4c9" }}>Stop sending</Text>
                                                </View>
                                            </TouchableNativeFeedback>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <TouchableNativeFeedback onPress={() => handleSendSpeed(-1000)} >
                                                <View style={styles.stopBtn}>
                                                    <Icon name="minus" size={20} color="#d4d4c9" />
                                                </View>
                                            </TouchableNativeFeedback>
                                        </View>
                                    </View>
                                }
                            </View>}
                        </View>
                    </ScrollView>
                </View>
                <View>
                    <TouchableNativeFeedback disabled={reconnect} onPress={handleReconnect}>
                        <View style={styles.connectBtn}>
                            <Text style={{ color: "#fff" }}>{reconnect ? "Reconnecting..." : "Reconnect"}</Text>
                        </View>
                    </TouchableNativeFeedback>
                </View>

            </View>
        </ImageBackground>
    )
}

const styles = StyleSheet.create({
    container: {
        height: '100%',
        width: '100%',
        padding: 10,
        justifyContent: "space-between"
    },
    detailsBox: {
        padding: 10,
        backgroundColor: "#333",
        borderRadius: 10,
    },
    contentBox: {
        flexDirection: 'column',
        justifyContent: "center",
        alignItems: "center"
    },

    micButton: {
        backgroundColor: '#7a7a7a',
        color: 'white',
        height: 200,
        width: 200,
        borderRadius: "50%",
        justifyContent: 'center',
        alignItems: 'center'
    },
    transCriptionBox: {
        marginTop: 30,
        alignItems: "flex-start",
        padding: 10,
        backgroundColor: "#333",
        borderRadius: 10,
        width: '100%'
    },
    stopBtn: {
        // width: "100%",
        backgroundColor: "#cf4444",
        padding: 10,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center"
    },
    connectBtn: {
        backgroundColor: '#c61e1a',
        color: 'white',
        paddingHorizontal: 50,
        paddingVertical: 15,
        width: '97%',
        textAlign: 'center',
        margin: 'auto',
        marginTop: 20,
        borderRadius: 30,
        justifyContent: 'center',
        flexDirection: 'row',
    },
    textInput: {
        height: 40,
        width: "100%",
        backgroundColor: "#636363",
        borderColor: "transparent",
        borderWidth: 1,
        paddingHorizontal: 10,
        borderRadius: 10,
        color: "#f0f0f0",
        flex: 1,

    },
    sendBtn: {
        backgroundColor: "#11a5f6",
        height: 40,
        width: 40,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center"
    }
})