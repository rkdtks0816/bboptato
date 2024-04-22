import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { ThreeJSOverlayView } from "@googlemaps/three";
import { MapSession } from "./MainSession";

const mapOptions = {
  tilt: 180,
  heading: 0,
  zoom: 20,
  center: { lat: 35.6594945, lng: 139.6999859 },
  mapId: "c59088943316d39e",
  disableDefaultUI: true, // 기본 UI 비활성화
  gestureHandling: "none", // 제스처 핸들링 비활성화
  keyboardShortcuts: false, // 키보드 단축키 비활성화
  zoomControl: false, // 줌 컨트롤 버튼 비활성화
  scrollwheel: false, // 마우스 스크롤을 통한 줌 변경 비활성화
  disableDoubleClickZoom: true, // 더블 클릭을 통한 줌 변경 비활성화
};

interface Location {
  latitude: number;
  longitude: number;
}

function GoogleMapsComponent({ location }: { location: Location }) {
  const mapRef = useRef<HTMLDivElement>(null); // 지도를 렌더링할 div의 ref.
  const mixer = useRef<THREE.AnimationMixer>();
  const actionMap = useRef<Record<string, THREE.AnimationAction> | undefined>();
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null); // 지도 인스턴스를 상태로 관리.
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchEnd, setTouchEnd] = useState({ x: 0, y: 0 });
  const [threeJSOverlayViewInstance, setThreeJSOverlayViewInstance] =
    useState<ThreeJSOverlayView | null>(null);

  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    const dx = touchEnd.x - touchStart.x;
    // dx는 터치 이동 거리의 차이입니다. 이 값을 기반으로 지도의 회전 값을 계산할 수 있습니다.
    // 예제에서는 간단히 dx 값에 비례하여 지도를 회전시킵니다.
    // 실제로는 dx 값과 사용자의 의도를 더 정확히 반영하는 로직을 구현해야 합니다.
    if (mapInstance && dx !== 0) {
      const currentHeading = mapInstance.getHeading() || 0;
      mapInstance.setHeading(currentHeading + dx * 0.1); // 회전 각도 조절을 위한 예시 값입니다.
    }
  };

  const animate = () => {
    requestAnimationFrame(animate);

    // 애니메이션 믹서 업데이트
    if (mixer.current) {
      mixer.current.update(0.01);
    }
  };

  const loadMapAndModel = (lat: number, lng: number) => {
    if (mapInstance) {
      const newPosition = {
        lat,
        lng,
      };

      mapInstance.panTo(newPosition);

      const scene = new THREE.Scene();

      // 조명 추가
      const ambientLight = new THREE.AmbientLight(0xffffff, 2); // 앰비언트 라이트
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // 방향성 라이트
      directionalLight.position.set(0, 1, 0); // 라이트의 위치 설정
      scene.add(ambientLight);
      scene.add(directionalLight);

      const loader = new FBXLoader();
      loader.load("MetaDino_6animation.fbx", (fbx: THREE.Object3D) => {
        // 모델의 스케일 조절
        fbx.scale.set(0.07, 0.07, 0.07); // x, y, z 스케일 값 조절
        fbx.position.x = 0;
        fbx.position.y = 0;
        fbx.position.z = 0;
        scene.add(fbx);

        // 애니메이션 mixer 설정
        mixer.current = new THREE.AnimationMixer(fbx);
        actionMap.current = {};

        fbx.animations.forEach((clip) => {
          if (mixer.current && actionMap.current) {
            const action = mixer.current.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity); // 무한 반복
            actionMap.current[clip.name] = action;
          }
        });

        // 기존 ThreeJSOverlayView 인스턴스 업데이트 또는 제거
        if (threeJSOverlayViewInstance) {
          threeJSOverlayViewInstance.onRemove(); // 맵에서 제거
          setThreeJSOverlayViewInstance(null); // 상태에서 제거
        }

        // 새로운 ThreeJSOverlayView 생성
        const newThreeJSOverlayView = new ThreeJSOverlayView({
          map: mapInstance,
          scene,
          anchor: {
            lat,
            lng,
            altitude: 0,
          },
          THREE,
        });

        setThreeJSOverlayViewInstance(newThreeJSOverlayView); // 상태 업데이트
      });

      animate();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  };

  const getActionName = (key: string): string => {
    switch (key) {
      case "1":
        return "META DINO|walk";
      case "2":
        return "META DINO|sayHi";
      case "3":
        return "META DINO|jump";
      case "4":
        return "META DINO|arrive";
      case "5":
        return "META DINO|sit idle";
      default:
        return "META DINO|stand idle";
    }
  };
  // 키보드 이벤트 처리
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!mixer.current || !actionMap.current || !mapInstance) return;

    // 방향키에 따른 위도, 경도 조정 값 설정
    let deltaLat = 0;
    let deltaLng = 0;
    const movementAmount = 0.001; // 조정할 위도와 경도의 양

    switch (event.key) {
      case "ArrowUp":
        deltaLat = movementAmount;
        break;
      case "ArrowDown":
        deltaLat = -movementAmount;
        break;
      case "ArrowLeft":
        deltaLng = -movementAmount;
        break;
      case "ArrowRight":
        deltaLng = movementAmount;
        break;
      default:
        // 기본값으로 액션 이름을 구하는 로직을 실행
        const actionName = getActionName(event.key);
        const action = actionMap.current[actionName];
        if (action && !action.isRunning()) {
          action.reset().play();
          action.setLoop(THREE.LoopOnce, 1);
        }
        return; // 방향키가 아니면 여기서 함수 종료
    }

    // 현재 지도의 중심 위치를 가져옴
    const currentCenter = mapInstance.getCenter();
    if (currentCenter) {
      // currentCenter가 undefined가 아니면 실행
      // 새로운 중심 위치 계산
      const newCenter = {
        lat: currentCenter.lat() + deltaLat,
        lng: currentCenter.lng() + deltaLng,
      };
      // 지도의 중심 위치 업데이트
      mapInstance.panTo(newCenter);
      // 공룡 모델의 위치와 ThreeJSOverlayView 업데이트
      loadMapAndModel(newCenter.lat, newCenter.lng);
    }
  };

  useEffect(() => {
    if (mapRef.current && !mapInstance) {
      // mapInstance가 아직 초기화되지 않았다면 초기화를 진행합니다.
      const map = new google.maps.Map(mapRef.current, {
        ...mapOptions,
        center: { lat: location.latitude, lng: location.longitude }, // 중심 위치 초기화
      });
      setMapInstance(map);
      // location이 변경될 때 걷는 애니메이션을 실행합니다.
      const walkAction = actionMap.current?.["META DINO|walk"];
      if (walkAction && !walkAction.isRunning()) {
        walkAction.reset().play();
        walkAction.setLoop(THREE.LoopOnce, 1);
      }
    }
  }, [mapRef, mapInstance, location]); // 의존성 배열에 location을 추가하여 위치가 변경될 때 마다 mapInstance를 업데이트합니다.

  useEffect(() => {
    if (mapInstance && location) {
      loadMapAndModel(location.latitude, location.longitude);
    }
  }, [mapInstance, location]); // location 변경 시 useEffect가 다시 실행되도록 의존성 배열에 추가합니다.

  return (
    <MapSession
      ref={mapRef}
      id="map"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  );
}

export default GoogleMapsComponent;
