if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "C:/Users/abhip/.gradle/caches/9.4.1/transforms/b56c9b64d19be5179e825dc94c2cfdc2/transformed/hermes-android-250829098.0.17-debug/prefab/modules/hermesvm/libs/android.armeabi-v7a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/abhip/.gradle/caches/9.4.1/transforms/b56c9b64d19be5179e825dc94c2cfdc2/transformed/hermes-android-250829098.0.17-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

