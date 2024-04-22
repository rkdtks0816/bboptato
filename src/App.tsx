import { useEffect, useState } from "react";
import { MainSession } from "./MainSession";
import GoogleMapsComponent from "./ThreeJSWrapper";

function App() {
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    // 위치 정보 감시를 시작하는 함수
    const startWatchingLocation = () => {
      if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setLocation({ latitude, longitude });
          },
          (error) => {
            console.error("Geolocation error: ", error);
            setLocation(null);
          },
          {
            enableHighAccuracy: true, // 더 정확한 위치 정보를 얻기 위해
            timeout: 5000, // 최대 대기 시간 (밀리초)
            maximumAge: 0, // 캐시된 위치 정보의 최대 나이
          }
        );

        // 컴포넌트가 언마운트될 때 위치 감시를 중지합니다.
        return () => navigator.geolocation.clearWatch(watchId);
      } else {
        console.error("Geolocation is not supported by this browser.");
        setLocation(null);
      }
    };

    startWatchingLocation();
  }, []);

  return (
    <MainSession>
      {location && <GoogleMapsComponent location={location} />}
    </MainSession>
  );
}

export default App;
