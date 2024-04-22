import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { MapSession } from "./MainSession";

const mapOptions = {
  tilt: 180,
  heading: 0,
  zoom: 20,
  center: { lat: 35.6594945, lng: 139.6999859 },
  mapId: "c59088943316d39e",
  disableDefaultUI: true, // 기본 UI 비활성화12
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
  const scene = useRef(new THREE.Scene()); // Scene 인스턴스 초기화
  const loader = useRef(new FBXLoader());
  const mixer = useRef<THREE.AnimationMixer>();
  const camera = useRef(
    new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
  ); // Camera 인스턴스 초기화
  const renderer = useRef(new THREE.WebGLRenderer({ antialias: true })); // Renderer 인스턴스 초기화
  renderer.current.setSize(window.innerWidth, window.innerHeight);
  const actionMap = useRef<Record<string, THREE.AnimationAction> | undefined>();
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null); // 지도 인스턴스를 상태로 관리.
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchEnd, setTouchEnd] = useState({ x: 0, y: 0 });

  const handleTouchStart = (event: TouchEvent) => {
    event.preventDefault(); // 기본 동작 방지
    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (event: TouchEvent) => {
    event.preventDefault(); // 기본 동작 방지
    const touch = event.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (event: TouchEvent) => {
    event.preventDefault(); // 기본 동작 방지
    const dx = touchEnd.x - touchStart.x;
    if (mapInstance && dx !== 0) {
      const currentHeading = mapInstance.getHeading() || 0;
      mapInstance.setHeading(currentHeading + dx * 0.1);
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

      const webglOverlayView = new google.maps.WebGLOverlayView();

      webglOverlayView.onAdd = () => {
        // 조명을 추가합니다.
        const ambientLight = new THREE.AmbientLight(0xffffff, 2); // 환경광
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // 방향성 광원
        directionalLight.position.set(0, 1, 0); // 광원의 위치 설정
        scene.current.add(ambientLight);
        scene.current.add(directionalLight);

        // FBX 모델을 로드합니다.
        loader.current.load(
          "MetaDino_6animation.fbx",
          (fbx: THREE.Object3D) => {
            // 모델의 스케일을 조정합니다.
            fbx.scale.set(0.07, 0.07, 0.07); // X, Y, Z 축 스케일 설정
            fbx.rotation.set(90, 0, 0);
            fbx.position.set(0, 0, 0); // 모델 위치 설정

            if (scene.current) {
              scene.current.add(fbx); // 장면에 모델을 추가합니다.
              mixer.current = new THREE.AnimationMixer(fbx); // 애니메이션 믹서를 설정합니다.
              actionMap.current = {}; // 액션 맵 초기화

              // 각 애니메이션 클립에 대해 액션을 생성하고 무한 반복 설정
              fbx.animations.forEach((clip) => {
                if (mixer.current && actionMap.current) {
                  const action = mixer.current.clipAction(clip);
                  action.setLoop(THREE.LoopRepeat, Infinity);
                  action.play();
                  actionMap.current[clip.name] = action;
                }
              });
            } else {
              console.error("Scene or model is not available");
            }
          },
          undefined,
          (error) => {
            console.error("An error happened during the FBX loading", error);
          }
        );

        animate();
      };
      webglOverlayView.onContextRestored = ({ gl }) => {
        // Create the js renderer, using the
        // maps's WebGL rendering context.
        renderer.current = new THREE.WebGLRenderer({
          canvas: gl.canvas,
          context: gl,
          ...gl.getContextAttributes(),
        });
        renderer.current.autoClear = true;
      };

      webglOverlayView.onDraw = ({ transformer }) => {
        const latLngAltitudeLiteral = {
          lat: location.latitude,
          lng: location.longitude,
        };

        // 지도에 모델을 올바르게 표시하기 위해 카메라 행렬을 업데이트합니다.
        const matrix = transformer.fromLatLngAltitude(latLngAltitudeLiteral);
        if (camera.current) {
          camera.current.projectionMatrix = new THREE.Matrix4().fromArray(
            matrix
          );
        }

        // WebGL 오버레이를 다시 그리도록 요청합니다.
        webglOverlayView.requestRedraw();

        // 업데이트된 카메라 행렬로 장면을 렌더링합니다.
        if (renderer.current && scene.current && camera.current) {
          renderer.current.render(scene.current, camera.current);
        }

        // Google Maps의 자체 GL 컨텍스트와의 상태 충돌을 피하기 위해 GL 상태를 리셋합니다.
        if (renderer.current) {
          renderer.current.resetState();
        }
      };

      // 지도에 WebGL 오버레이 뷰를 설정합니다.
      webglOverlayView.setMap(mapInstance);

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
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
