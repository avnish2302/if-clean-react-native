import { View, Text, Pressable, Image, ActivityIndicator, BackHandler } from "react-native"
import { useState, useEffect } from "react"
import * as ImagePicker from "expo-image-picker"                          // it lets user select image from gallery or take photo from camera
import * as ImageManipulator from "expo-image-manipulator"                // edits image before upload : resize & compress. Important for performance and backend size limits

const lightTheme = {
  background: "#f5f5f5",
  card: "#ffffff",
  text: "#000000",
  subText: "#505050",
  border: "#ddd",
  button: "#000",
  buttonText: "#fff",
  secondaryBtn: "#eee",
}

const darkTheme = {
  background: "#212121",
  card: "#3f3f3f",
  text: "#ffffff",
  subText: "#aaa",
  border: "#3f3f3f",
  button: "#ffffff",
  buttonText: "#000",
  secondaryBtn: "#1a1a1a",
}

export default function App() {
  const [image, setImage] = useState(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [isDark, setIsDark] = useState(true)


  useEffect(() => {
  const onBackPress = () => {
    if (previewVisible) {
      setPreviewVisible(false)                                              // close image
      return true                                                           // prevent default (exit app)
    }
    return false                                                            // allow normal behavior
  }

  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    onBackPress
  )
  return () => subscription.remove()
}, [previewVisible])


  const theme = isDark ? darkTheme : lightTheme
  const isDisabled = loading || !image

  const pickImage = async () => {                                           // runs when user taps "Select photo". async allows use of await
    const res = await ImagePicker.launchImageLibraryAsync({                 // opens gallery. User selects image. await pauses execution until user selects image or cancels. returns object -> res 
      mediaTypes: ["images"],                                               // restricts selection to images only
      quality: 1,                                                           // range 0 -> 1
      allowsEditing: false,                                                 // if true, user can crop image before selecting
      exif: false,
    })

    if (!res.canceled) {                                                    // user didn't cancel. If user cancels skip everything
      const picked = res.assets[0]
      const manipulated = await ImageManipulator.manipulateAsync(           // processes image before upload
        picked.uri,                                                         // local file path of image
        [{ resize: { width: 1280 } }],                                      // resizes image width to 1280px. height auto-adjusts (aspect ratio preserved)
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },        // reduces file size by 50%. format converts image to JPEG
      )

      setImage({                                                            // store processed image in state
        uri: manipulated.uri,                                               // new file path after processing
        mimeType: "image/jpeg",                                             // tells backend what type of file it is
        width: manipulated.width,                                           // dimensions after resize
        height: manipulated.height,
      })
      setResult(null)                                                       // clears previous API request
    }
  }

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()    // asks user for camera access
    if (!permission.granted) {                                              // if user denies -> block camera
      alert("Camera permission is required.")                               // show alert
      return
    }

    const res = await ImagePicker.launchCameraAsync({                       // opens camera UI
      mediaTypes: ["images"],                                               // only photos
      quality: 1,                                                           // full quality
      allowsEditing: false,                                                 // no cropping
      exif: false,                                                          // no metadata
    })

    if (!res.canceled) {                                                    // then same resize, same compression, same state update
      const picked = res.assets[0];
      const manipulated = await ImageManipulator.manipulateAsync(
        picked.uri,                                                         // argument 1 : input image file path
        [{ resize: { width: 1280 } }],                                      // meaning : perform resize, set width = 1280px, height auto adjusts. Eg (before 4032 x 3024) (after 1280 x ~960)
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },        // argument 3,  compress : 0.5 (reduce file size by 50%), format : JPEG (smaller size than PNG)
      )
      setImage({
        uri: manipulated.uri,
        mimeType: "image/jpeg",
        width: manipulated.width,
        height: manipulated.height,
      })
      setResult(null)
    }
  }

  const analyzeImage = async () => {
    if (!image || loading) return                                            // stop execution if : no image selected. OR already loading

    try {
      setLoading(true)                                                       // starts loading state, UI shows spinner, disables button
      const formData = new FormData();                                       // creates object for file upload. Used in multipart/form-data request
      formData.append("image", {                                             // adds file under key "image"
        uri: image.uri,                                                      // local file path
        name: "photo.jpg",                                                   // filename sent to server
        type: image.mimeType || "image/jpeg",                                // MIME type. Fallback if undefined
      })

      const controller = new AbortController()                               // creates controller to cancel request
      const timeout = setTimeout(() => controller.abort(), 30000)            // after 30 sec -> abort request. This only works if you pass signal to fetch (you didn't yet)

      const response = await fetch(                                          // sends HTTP request
        "https://if-clean-react-native.onrender.com/analyze-cleanliness",    // backend URL
        {
          method: "POST",                                                    // sending data
          body: formData,                                                    // attaches image
          signal: controller.signal
        },
      )

      clearTimeout(timeout)                                                  // stops timeout if request finishes

      const text = await response.text()                                     // reads raw response as string. response.text() and response.json() always returns Promise so we need to use await

      let data                                                               // declare variable
      try {
        data = JSON.parse(text)                                              // convert string -> object
      } catch {                                                              // if parsing fails
        throw new Error("Invalid server response")
      }

      if (!response.ok) {                                                    // status check. Checks HTTP status
        throw new Error(data.error || "Request failed")                      // throw backend error
      }
      setResult(data)                                                        // store result. Triggers UI update
    } catch (err) {
      if (err.name === "AbortError") {                                       // request was cancelled
        setResult({ error: "Request timed out. Please try again" })
      } else {
        console.log("Error:", err)                                           // debug log
        setResult({ error: err.message })                                    // show error in UI
      }
    } finally {                                                              // always runs. Stops loader
      setLoading(false)
    }
  }

  return (
    <View
      style={{
        flex: 1,                                                             // takes full screen height. Required for layout
        backgroundColor: theme.background,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
    >
      <Pressable
        onPress={() => setIsDark((prev) => !prev)}
        style={{
          position: "absolute",                                              // removes from normal layout flow. Allows placing anywhere on screen
          top: 50,                                                           // 50px from top
          right: 20,                                                         // 20px from right
          zIndex: 10,                                                        // ensures it appears above other elements
          width: 50,
          height: 50,
          backgroundColor: theme.card,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 25,
          borderWidth: 1,
          borderColor: theme.border,

          shadowColor: "#000",                                             // iOS shadow 
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },

          elevation: 5,                                                      // androiod shadow 
        }}
      >
        <Text style={{ fontSize: 20 }}>{isDark ? "☀️" : "🌙"}</Text>
      </Pressable>

      {(image || result) && (
        <Pressable
          onPress={() => {
            setImage(null)
            setResult(null)
          }}
          disabled={loading}
          style={{
            alignSelf: "flex-end",                                          // aligns to right side
            marginBottom: 10,
            paddingHorizontal: 16,
            padding: 12,
            backgroundColor: loading ? "#777" : "#ef4444",
            borderRadius: 10,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "white" }}>Reset</Text>
        </Pressable>
      )}

      <View                                                                 // main card container
        style={{
          width: "100%",
          maxWidth: 420,
          backgroundColor: theme.card,
          borderRadius: 20,
          padding: 20,

          shadowColor: "#000",                                            // iOS shadow
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },

          elevation: 8,                                                     // android shadow 
        }}
      >
        <Text
          style={{
            color: theme.text,
            fontSize: 22,
            textAlign: "center",
            marginBottom: 20,
            fontWeight: "600",
          }}
        >
          Analyzer Tool
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={pickImage}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#777" : theme.secondaryBtn,
              borderColor: theme.border,
              borderWidth: 1,
              padding: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: theme.text, textAlign: "center" }}>
              {loading ? "Please wait..." : "Select photo"}
            </Text>
          </Pressable>

          <Pressable
            onPress={takePhoto}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#777" : theme.secondaryBtn,
              borderColor: theme.border,
              borderWidth: 1,
              padding: 12,
              borderRadius: 10,
            }}
          >
            <Text
              style={{
                color: theme.text,
                textAlign: "center",
              }}
            >
              {loading ? "Please wait..." : "Camera"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={analyzeImage}
          disabled={isDisabled}
          style={{
            marginTop: 20,
            backgroundColor: theme.button,
            padding: 12,
            borderRadius: 10,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            opacity: isDisabled ? 0.6 : 1,
          }}
        >
          {loading ? (
            <>
              <Text style={{ color: theme.buttonText }}>Analyzing</Text>
              <ActivityIndicator size="small" color={theme.buttonText} />
            </>
          ) : (
              <Text style={{ color: theme.buttonText }}>Analyze</Text>
          )}
        </Pressable>

        {!image && result?.error && (
          <Text
            style={{
              color: "red",
              marginTop: 14,
              textAlign: "center",
              fontSize: 13,
            }}
          >
            {result.error}
          </Text>
        )}

        {image && (                                                     // show image + result
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontSize: 16 }}>Image</Text>
              </View>

              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontSize: 16 }}>Result</Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 20,
                backgroundColor: theme.secondaryBtn,
                padding: 12,
                borderRadius: 12,
                flexDirection: "row",
              }}
            >
              <View style={{ flex: 1, alignItems: "center" }}>
                <Pressable onPress={() => setPreviewVisible(true)}>
                  <Image
                    source={{ uri: image.uri }}
                    style={{ width: 120, height: 120, borderRadius: 10 }}
                    />
                </Pressable>
              </View>

              <View                                                     // divider
                style={{
                  width: 1,
                  backgroundColor: "#bb4e00",
                  marginHorizontal: 10,
                }}
              />

              <View style={{ flex: 1 }}>
                {loading && <ActivityIndicator/>}

                {result && (
                  <>
                    {result.error && (
                      <Text style={{ color: "red", textAlign: "center" }}>{result.error}</Text>
                    )}

                    {!result.error && !result.valid && (
                      <>
                        <Text style={{ color: "yellow", fontWeight: "bold" }}>Invalid</Text>
                        <Text style={{ color: "gray" }}>{result.reason}</Text>
                      </>
                    )}

                    {result.valid && result.cleanliness?.status === "clean" && (
                      <>
                        <Text style={{ color: "#4ade80", fontWeight: "bold" }}>Clean</Text>
                        <Text style={{ color: "gray" }}>{(result.cleanliness.confidence * 100).toFixed(0)}%</Text>
                      </>
                    )}

                    {result.valid && result.cleanliness?.status === "dirty" && (
                      <>
                        <Text style={{ color: "#f87171", fontWeight: "bold" }}>Dirty</Text>
                        <Text style={{ color: theme.subText, marginBottom: 6 }}>{(result.cleanliness.confidence * 100).toFixed(0)}%</Text>

                        {result.cleanliness.issues?.map((issue, i) => (
                          <Text
                            key={issue}                                    // using index as key causes react to re-render incorrectly if the order changes. Better use content as key since issues are unique strings
                            style={{
                              backgroundColor: theme.secondaryBtn,
                              borderColor: theme.border,
                              borderWidth: 1,
                              borderRadius: 8,
                              padding: 6,
                              marginBottom: 5,
                              color: theme.text,
                              fontSize: 12,
                            }}
                          > • {issue}</Text>
                        ))}
                      </>
                    )}

                    {result.valid &&
                      result.cleanliness?.status !== "clean" && result.cleanliness?.status !== "dirty" && (
                        <Text style={{ color: "yellow", fontWeight: "bold" }}>
                          Uncertain
                        </Text>
                    )}
                  </>
                )}
              </View>
            </View>
          </View>
        )}
      </View>

      {previewVisible && image && (
        <View
        style = {{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.95)",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 100
        }}
        >
          <Pressable
          onPress = {() => setPreviewVisible(false)}
          style = {{
            position: "absolute",
            top: 50,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 101,
          }}
          >
            <Text style={{color: "white", fontSize: 20}}>✕</Text>
          </Pressable>
          <Image
          source = {{uri: image.uri}}
          style = {{
            width: 350,
            height: 500,
            resizeMode: "contain"
          }}
          />
        </View>
      )}
    </View>
  );
}
